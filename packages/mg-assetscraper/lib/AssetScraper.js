import {URL} from 'node:url';
import {join, dirname, basename, extname} from 'node:path';
import cheerio from 'cheerio';
import got from 'got';
import {parseSrcset} from 'srcset';
import {fileTypeFromBuffer, fileTypeFromStream} from 'file-type';
import mime from 'mime-types';
import MarkdownIt from 'markdown-it';
import prettyBytes from 'pretty-bytes';
import SmartRenderer from '@tryghost/listr-smart-renderer';
import replaceAll from 'fast-replaceall';
import AssetCache from './AssetCache.js';

// Taken from https://github.com/TryGhost/Ghost/blob/main/ghost/core/core/shared/config/overrides.json
const knownImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/webp'];
const knownMediaTypes = ['video/mp4', 'video/webm', 'video/ogg', 'audio/mpeg', 'audio/mp3', 'audio/vnd.wav', 'audio/wave', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/x-m4a'];
const knownFileTypes = ['application/pdf', 'application/json', 'application/ld+json', 'application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.text', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/rtf', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/xml', 'application/atom+xml'];
const knownTypes = [...knownImageTypes, ...knownMediaTypes, ...knownFileTypes];

const isValidUrlString = (string) => {
    try {
        new URL(string);
        return true;
    } catch (err) {
        return false;
    }
};

const trim = (str, c = '\\s') => {
    return str.replace(new RegExp(`^([${c}]*)(.*?)([${c}]*)$`), '$2');
};

/**
 * How does this work?
 * Look at the comments above each task in the `fetch()` method
 */
export default class AssetScraper {
    /**
     * @param {FileCache} fileCache
     * @param {Object} options
     * @param {Bool} options.optimize
     * @param {Int|Bool} options.sizeLimit A size limit in MB
     * @param {Bool} options.allowImages
     * @param {Bool} options.allowMedia
     * @param {Bool} options.allowFiles
     * @param {String} options.baseDomain
     * @param {Object} ctx Task runner context
     */
    constructor(fileCache, options, ctx = {}) {
        this.fileCache = fileCache;
        this.defaultOptions = Object.assign({
            optimize: true,
            sizeLimit: false,
            allowImages: true,
            allowMedia: true,
            allowFiles: true,
            baseDomain: null
        }, options);

        this.ctx = ctx;

        this.warnings = (ctx.warnings) ? ctx.warnings : [];

        this.logger = ctx.logger;

        // Convert MB to bytes for file size comparison
        if (this.defaultOptions.sizeLimit) {
            this.defaultOptions.sizeLimit = (this.defaultOptions.sizeLimit * 1000000);
        }

        // Assets will be found in this value
        this._initialValue = null;

        // Assets found in `this._initialValue` will be stored here
        this._foundAssets = [];

        // Like `this._initialValue`, but will be updated with locally-stored asset paths
        this._fixedValues = null;

        this._blockedDomains = [];
        this._blockedDomains.push('images.unsplash.com');// Unsplash images
        this._blockedDomains.push('gravatar.com'); // User avatars
        this._blockedDomains.push('www.youtube.com'); // YouTube website
        this._blockedDomains.push('ytimg.com'); // YouTube images
        this._blockedDomains.push('twitter.com'); // Twitter website
        this._blockedDomains.push('pbs.twimg.com'); // Twitter images
        this._blockedDomains.push('facebook.com'); // Facebook website
        this._blockedDomains.push('instagram.com'); // Instagram website
        this._blockedDomains.push('fbcdn.net'); // Facebook & Instagram images
        this._blockedDomains.push('amazon.com'); // Amazon website
        this._blockedDomains.push('media-amazon.com'); // Amazon images
        this._blockedDomains.push('ebay.com'); // eBay website
        this._blockedDomains.push('ebayimg.com'); // eBay images
        this._blockedDomains.push('etsy.com'); // Etsy website
        this._blockedDomains.push('etsystatic.com'); // Etsy images

        this._settingsKeys = [
            'logo',
            'cover_image',
            'icon',
            'og_image',
            'twitter_image',
            'portal_button_icon'
        ];

        this._simpleKeys = [
            'src',
            'feature_image',
            'profile_image',
            'cover_image',
            'header_image',
            'og_image',
            'twitter_image',
            'thumbnailSrc',
            'customThumbnailSrc',
            'productImageSrc'
        ];

        this.AssetCache = new AssetCache(fileCache);
    }

    /**
     * Strip any types of URL or sting we don't want to fetch
     * @param {String} input The input string
     * @returns {Bool}
     */
    isValidURL(input) {
        if (!input) {
            return false;
        }

        if (input === '') {
            return false;
        }

        if (input.length === 0) {
            return false;
        }

        if (input.trim().length === 0) {
            return false;
        }

        if (input.startsWith('mailto:')) {
            return false;
        }

        if (input.startsWith('#')) {
            return false;
        }

        if (input.startsWith('/#')) {
            return false;
        }

        if (input.trim().includes(' ')) {
            return false;
        }

        return true;
    }

    /**
     * Transform a URL to be absolute
     * @param {String} assetUrl The URL to the asset
     * @return {String} The absolute URL
     */
    relativeToAbsolute(assetUrl = false) {
        const theDomain = this.defaultOptions.baseDomain;

        let newRemoteValue = assetUrl;

        if (assetUrl.startsWith('__GHOST_URL__')) {
            assetUrl = assetUrl.replace('__GHOST_URL__', '');
        }

        // If we have a domain value, prefix relative links with it
        if (theDomain) {
            let parsedUrl = new URL(assetUrl, theDomain);
            newRemoteValue = parsedUrl.href;
        }

        return newRemoteValue;
    }

    /**
     * Add an item to the _rawImageValues array
     * @param {Object} obj
     * @param {Object} obj.remote The asset source as supplied
     * @param {Object} [obj.ref] Where the asset came from
     *
     * @example
     * this.addRawValue({remote: '/image.jpg'});
     */
    addRawValue(obj) {
        if (this.isValidURL(obj.remote)) {
            // Fix schemaless URLs
            if (obj.remote.startsWith('//')) {
                obj.newRemote = obj.remote.replace('//', 'https://');
            } else {
                obj.newRemote = obj.remote;
            }

            // Trim quote marks from the start & end of strings
            obj.newRemote = trim(obj.newRemote, '\'"`');

            if (obj.newRemote.includes('#:~:')) {
                obj.newRemote = obj.newRemote.slice(0, obj.newRemote.indexOf('#:~:'));
            }

            if (isValidUrlString(obj.newRemote)) {
                // Remove the commonly long `ref_url`, which can cause `ENAMETOOLONG` errors
                let parsedUrl = new URL(obj.newRemote);
                const urlParams = new URLSearchParams(parsedUrl.search);
                urlParams.delete('ref_url');
                parsedUrl.search = urlParams.toString();
                obj.newRemote = parsedUrl.href;
            }

            // Transform relative links starting with `/` or `__GHOST_URL__` to absolute
            obj.newRemote = this.relativeToAbsolute(obj.newRemote);

            // TODO: If a blocked domain, still add to cache but add a `skip: true` value so we don't keep checking it
            if (this.isBlockedDomain(obj.newRemote)) {
                obj.skip = true;
                obj.skipReason = 'Is blocked domain';
            }

            this.AssetCache.add(obj);

            const alreadyExists = this._foundAssets.find(element => element.remote === obj.remote);

            if (!alreadyExists) {
                this._foundAssets.push(obj);
            }
        }
    }

    /**
     * Add multiple items to the _rawImageValues array - Mostly a testing utility
     * @param {Array} objects An array of objects to add
     *
     * @example
     * this.addRawValues([{remote: '/image.jpg'}]);
     */
    addRawValues(objects) {
        objects.forEach((object) => {
            this.addRawValue(object);
        });
    }

    /**
     * Get the list of updated asset values
     * @returns {Object} A list of all updated asset values
     */
    finalObjectValue() {
        return JSON.parse(this._fixedValues);
    }

    /**
     * Add a domain to the blocked list
     * @param {String|Array} domain The domains to be blocked
     *
     * @example
     * addBlockedDomain('test.com');
     * addBlockedDomain(['test.com', 'ortest.com']);
     */
    addBlockedDomain(domain) {
        if (Array.isArray(domain)) {
            domain.forEach((item) => {
                this._blockedDomains.push(item);
            });
        } else {
            this._blockedDomains.push(domain);
        }
    }

    /**
     * Check if a domain is in the blocked list
     *
     * @param {String} assetURL The URL to the asset
     * @return {Bool}
     *
     * @example
     * isBlockedDomain('https://example.com/my/image.jpg');
     */
    isBlockedDomain(assetURL) {
        const contains = this._blockedDomains.some((element) => {
            if (assetURL.includes(element)) {
                return true;
            }

            return false;
        });

        return contains;
    }

    /**
     * Find assets in Markdown
     * @param {String} string The Markdown string
     *
     * @example
     * findInMarkdown('![]()');
     */
    findInMarkdown(string, postContext) {
        const markdownTokenLooper = (tokens, postContext) => { // eslint-disable-line no-shadow
            tokens.forEach((token) => {
                if (token.type === 'image' && token.attrs) {
                    token.attrs.forEach((item) => {
                        if (item[0] === 'src') {
                            this.addRawValue({
                                remote: item[1],
                                postContext
                            });
                        }
                    });
                } else if (token.type === 'link_open' && token.attrs) {
                    token.attrs.forEach((item) => {
                        if (item[0] === 'href') {
                            this.addRawValue({
                                remote: item[1],
                                postContext
                            });
                        }
                    });
                } else if (token.type === 'html_inline') {
                    this.findInHTML(token.content, postContext);
                }

                if (token.children) {
                    markdownTokenLooper(token.children, postContext);
                }
            });
        };

        const md = new MarkdownIt({
            html: true
        });

        try {
            const mdTokens = md.parse(string, {});
            markdownTokenLooper(mdTokens, postContext);
        } catch (error) {
            this.logger.error({message: 'Failed to parse Markdown string', markdown: string});
            throw error;
        }
    }

    /**
     * Find assets in HTML
     * @param {String} string The HTML string
     *
     * @example
     * findInMarkdown('<img src="" />');
     */
    findInHTML(html, postContext) {
        // The two options here prevent URLs from being decoded, so they remain exactly as they're supposed to be
        // Without this, `image.jpg?w=768&amp;ssl=1` gets turned into `image.jpg?w=768&ssl=1`
        // But we don't want this, we need them to be untouched
        let $ = cheerio.load(html, {
            xmlMode: true,
            decodeEntities: false
        });

        $('a[href]').each((i, el) => {
            let $link = $(el);
            let href = $link.attr('href') || false;

            this.addRawValue({
                remote: href,
                postContext
            });
        });

        $('img').each((i, el) => {
            let $image = $(el);
            let type = $image.attr('src') === undefined ? 'data-src' : 'src';

            if ($image.attr('src') && $image.attr('src').startsWith('data:')) {
                return false;
            }

            let src = $image.attr(type);

            this.addRawValue({
                remote: src,
                postContext
            });
        });

        $('picture source').each((i, el) => {
            let srcset = $(el).attr('srcset');
            let srcsetParts = parseSrcset(srcset);

            if (srcsetParts) {
                srcsetParts.forEach((item) => {
                    this.addRawValue({
                        remote: item.url,
                        postContext
                    });
                });
            }
        });

        $('video').each((i, el) => {
            let $video = $(el);

            if ($video.attr('poster')) {
                let posterSrc = $video.attr('poster');

                this.addRawValue({
                    remote: posterSrc,
                    postContext
                });
            }

            if ($video.attr('src')) {
                let videoSrc = $video.attr('src');

                this.addRawValue({
                    remote: videoSrc,
                    postContext
                });
            }
        });

        $('video source').each((i, el) => {
            if ($(el).attr('src')) {
                let videoSrc = $(el).attr('src');

                this.addRawValue({
                    remote: videoSrc,
                    postContext
                });
            }
        });

        $('audio').each((i, el) => {
            if ($(el).attr('src')) {
                let audioSrc = $(el).attr('src');

                this.addRawValue({
                    remote: audioSrc,
                    postContext
                });
            }
        });

        $('audio source').each((i, el) => {
            if ($(el).attr('src')) {
                let audioSrc = $(el).attr('src');

                this.addRawValue({
                    remote: audioSrc,
                    postContext
                });
            }
        });

        $('[style*="background-image"]').each(async (i, el) => {
            let $image = $(el);
            let match = $image.css('background-image').match(/url\(([^)]*?)\)/);

            if (match) {
                let src = match[1];

                this.addRawValue({
                    remote: src,
                    postContext
                });
            }
        });

        $('[style*="background:"]').each(async (i, el) => {
            let $image = $(el);
            let match = $image.css('background').match(/url\(([^)]*?)\)/);

            if (match) {
                let src = match[1];

                this.addRawValue({
                    remote: src,
                    postContext
                });
            }
        });
    }

    /**
     * Find assets in Mobiledoc
     * @param {String|Object} value The Mobiledoc string
     *
     * @example
     * findInMarkdown('{""}');
     * findInMarkdown(mobiledocObject);
     */
    findInMobiledoc(value, postContext) {
        // Parse JSON if it's still a string
        const jsonData = (typeof value === 'string') ? JSON.parse(value) : value;

        const processMobiledocImages = (object, postContext) => { // eslint-disable-line no-shadow
            for (let key in object) {
                let objectValue = object[key];
                if (typeof objectValue === 'object') {
                    processMobiledocImages(objectValue, postContext);
                } else {
                    if (this._simpleKeys.includes(key)) {
                        this.addRawValue({
                            remote: objectValue,
                            postContext
                        });
                    } else if (object.markdown) {
                        this.findInMarkdown(object.markdown, postContext);
                    } else if (object.html) {
                        this.findInHTML(object.html, postContext);
                    }
                }
            }
        };

        processMobiledocImages(jsonData, postContext);
    }

    /**
     * Find assets in a JSON object
     * @param {String|Object} json The Mobiledoc string
     *
     * @example
     * findInMarkdown('{""}');
     * findInMarkdown(mobiledocObject);
     */
    findInObject(json) {
        // Parse JSON if it's still a string
        const jsonData = (typeof json === 'string') ? JSON.parse(json) : json;

        const iterate = (obj) => {
            Object.keys(obj).forEach((key) => {
                let value = obj[key];

                const postContext = {
                    title: obj.title || false,
                    slug: obj.slug || false
                };

                // Settings gets special handling because it has key:value pairs
                if (key === 'settings') {
                    value.forEach((item) => {
                        // If the key is a known pair, push it to the list
                        if (this._settingsKeys.includes(item.key)) {
                            this.addRawValue({
                                remote: item.value,
                                postContext
                            });
                        }
                    });
                }

                if (typeof value === 'object' && value !== null) {
                    // If the value is still an object, keep looping through
                    iterate(value);
                } else {
                    // The value is a now a string, push it to the list
                    if (key && value && value.length > 0) {
                        if (key === 'mobiledoc') {
                            this.findInMobiledoc(value, postContext);
                        } else if (key === 'html') {
                            this.findInHTML(value, postContext);
                        } else if (this._simpleKeys.includes(key)) {
                            this.addRawValue({
                                remote: value,
                                postContext
                            });
                        }
                    }
                }
            });
        };

        iterate(jsonData);
    }

    /**
     * Get the headers for a remote file without downloading the whole thing
     * @param {String} src A URL to a remote asset
     * @returns {Object} The headers
     *
     * @example
     * getRemoteHeaders('https://example.com/my/file.jpg');
     * => {status: 200, headers: {...}}
     */
    getRemoteHeaders(src) {
        return new Promise((resolve, reject) => {
            const stream = got.stream(src, {
                timeout: 10000,
                retry: 0 // Not needed as we're requesting headers that either exist or don't
            });

            let req;

            stream.on('request', _req => req = _req);

            stream.on('response', async (res) => {
                let fileType;

                if (res.headers['content-type'] && !res.headers['content-type'].includes('text/html')) {
                    fileType = await fileTypeFromStream(stream);
                }

                req.abort();

                if (res.headers) {
                    let theHeaders = res.headers;

                    if (theHeaders['content-type'] === 'application/octet-stream') {
                        const disposition = theHeaders['content-disposition'];
                        const parts = disposition.split('.');
                        const extension = parts.pop();
                        let newType = mime.lookup(extension);
                        theHeaders['content-type'] = newType;
                    } else if (fileType && fileType.mime) {
                        theHeaders['content-type'] = fileType.mime;
                    }

                    resolve({
                        status: res.statusCode,
                        headers: theHeaders
                    });
                } else {
                    reject('Failed to fetch file data');
                }
            });

            stream.on('error', (error) => {
                if (req) {
                    req.destroy();
                }
                reject(error);
            });
        });
    }

    /**
     * Create tasks to find out what the file type if for all given assets
     * @returns {Array} The list of tasks for Listr to run
     */
    applyFileTypes() {
        // TODO: Add the ability to rate limit
        let tasks = [];

        this._foundAssets.forEach((item) => {
            let cacheItem = this.AssetCache.find({remote: item.remote});

            tasks.push({
                title: `Checking file type: ${item.newRemote}`,
                skip: () => {
                    return cacheItem && (cacheItem.checked || cacheItem.skip);
                },
                task: async () => {
                    let newCache = item;

                    newCache.checked = true;
                    newCache.data = {};
                    newCache.head = {};

                    try {
                        const theHead = await this.getRemoteHeaders(item.newRemote);

                        newCache.status = theHead.status;

                        if (theHead.headers) {
                            if (theHead.headers['content-type']) {
                                newCache.data.type = theHead.headers['content-type'].split('/')[0];
                                newCache.head.contentType = theHead.headers['content-type'];
                            }

                            if (theHead.headers['content-length']) {
                                newCache.head.contentLength = parseInt(theHead.headers['content-length']);
                            }
                        }

                        this.AssetCache.add(newCache);
                    } catch (error) {
                        newCache.skip = true;
                        newCache.skipReason = (error && error.code) ? error.code : 'Undefined error';
                        this.AssetCache.add(newCache);

                        this.logger.debug({message: `Failed to fetch asset ${item.remote}`, src: item.remote, error});
                    }
                }
            });
        });

        return tasks;
    }

    /**
     * Get mime type & extension from a buffer
     * @async
     * @param {Buffer} buffer The file buffer
     * @returns {Object}
     *
     * @example
     * await getAssetDataFromBuffer(<Buffer>);
     */
    async getAssetDataFromBuffer(buffer) {
        const fileTypeData = await fileTypeFromBuffer(buffer);

        return fileTypeData;
    }

    /**
     * Change the file extension of a string
     * @param {String} string The original supplied string
     * @param {String} ext The extension to change to
     * @returns {String} The supplied string with the new extension
     *
     * @example
     * changeExtension('/my-file.jpeg', 'jpg');
     */
    changeExtension(string, ext) {
        return join(dirname(string), basename(string, extname(string)) + '.' + ext);
    }

    /**
     * Download remote file
     * @async
     * @param {String} src The URL to the remove file
     * @param {Object} [ctx] The global context
     * @return {Object} The response from the HTTP client
     */
    async downloadFile(src) {
        try {
            const response = await got(src, {
                responseType: 'buffer',
                timeout: 20000,
                retry: 0 // Not needed as we're requesting files that either exist or don't
            });

            return response;
        } catch (error) {
            this.logger.error({message: `Failed to download asset ${src}`, src, error});
        }
    }

    /**
     * Fetch file & apply file tye info
     * @async
     * @param {String} src The URL to the remove file
     * @param {Object} [ctx] The global context
     * @return {Object} An object containing the HTTP client response, and file type data
     */
    async fetchFile(src, ctx = {}) {
        try {
            const response = await this.downloadFile(src, ctx);
            const fileData = await this.getAssetDataFromBuffer(response.body);

            return {
                response,
                fileData
            };
        } catch (error) {
            this.logger.error({message: `Failed to get data from file buffer ${src}`, src, error});
        }
    }

    /**
     * Check if the given mime type is allowed to be downloaded
     * @param {String} mime
     * @returns {Bool}
     *
     * @example
     * isAllowedMime('application/pdf');
     */
    isAllowedMime(mimeType) {
        let allowedMimes = [];

        if (this.defaultOptions.allowImages) {
            allowedMimes.push(...knownImageTypes);
        }

        if (this.defaultOptions.allowMedia) {
            allowedMimes.push(...knownMediaTypes);
        }

        if (this.defaultOptions.allowFiles) {
            allowedMimes.push(...knownFileTypes);
        }

        if (allowedMimes.includes(mimeType)) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Determine is a given asset is within the supplied size limit
     * @param {Object} obj
     * @returns {Bool}
     */
    isWithinSizeLimit(obj) {
        if (this.defaultOptions.sizeLimit) {
            if (obj.head.contentLength > this.defaultOptions.sizeLimit) {
                this.warnings.push({
                    message: `File is larger than allowed`,
                    context: obj.newRemote,
                    slug: obj.postContext?.slug || null,
                    details: `This file size is ${prettyBytes(obj.head.contentLength)}, the maximum file size is ${prettyBytes(this.defaultOptions.sizeLimit)}`
                });

                this.logger.warn({message: `File is larger than allowed ${obj.newRemote} (This bytes: ${obj.head.contentLength} / Max bytes: ${this.defaultOptions.sizeLimit})`});

                return false;
            }
        }

        return true;
    }

    /**
     * Determine where the asset should be saved (`/content/images`, `/content/media`, `/content/files`)
     * @param {String} mime
     * @return {String|Bool}
     *
     * @example
     * determineSaveLocation('application/pdf');
     * => `files`
     *
     * determineSaveLocation('application/x-shockwave-flash');
     * => false
     */
    determineSaveLocation(mimeType) {
        if (knownImageTypes.includes(mimeType)) {
            return 'images';
        } else if (knownMediaTypes.includes(mimeType)) {
            return 'media';
        } else if (knownFileTypes.includes(mimeType)) {
            return 'files';
        }

        return false;
    }

    /**
     * Create tasks to download allowed assets
     * @param {Object} [ctx]
     * @returns {Array} The list of tasks for Listr to run
     */
    downloadFiles(ctx = {}) {
        // TODO: Add the ability to rate limit
        let tasks = [];

        this.AssetCache.all().forEach((item) => {
            if (item.skip) {
                return false;
            }

            if (!item.head) {
                return false;
            }

            if (!this.isAllowedMime(item.head.contentType)) {
                return false;
            }

            if (item.head.contentLength && !this.isWithinSizeLimit(item)) {
                return false;
            }

            const src = item.newRemote;
            const impliedFileType = item.head.contentType || null;
            const saveLocation = this.determineSaveLocation(impliedFileType);

            const assetUrl = new URL(src);
            const assetFile = this.fileCache.resolveFileName(assetUrl.pathname, saveLocation);
            let imageOptions = Object.assign(assetFile, this.defaultOptions);

            // File extensions and paths can change, so check the saved output path
            const assetAlreadyDownloaded = (item.newLocal) ? this.fileCache.hasFile(item.newLocal, 'zip') : this.fileCache.hasFile(assetFile.storagePath, 'zip');

            tasks.push({
                title: `Downloading file: ${src}`,
                skip: () => {
                    if (assetAlreadyDownloaded) {
                        return true;
                    }
                },
                task: async () => {
                    try {
                        let newFile = await this.fetchFile(src, ctx);

                        if ((knownTypes.includes(newFile.fileData.mime))) {
                            // Set the file extension to match the buffers mime type
                            imageOptions.filename = this.changeExtension(imageOptions.filename, newFile.fileData.ext);
                            imageOptions.storagePath = this.changeExtension(imageOptions.storagePath, newFile.fileData.ext);
                            imageOptions.outputPath = this.changeExtension(imageOptions.outputPath, newFile.fileData.ext);

                            // Trim the file name length to 200 characters
                            let theExt = extname(imageOptions.outputPath);
                            let base = basename(imageOptions.outputPath, theExt);

                            imageOptions.storagePath = imageOptions.storagePath.replace(base, base.substring(0, 200));
                            imageOptions.outputPath = imageOptions.outputPath.replace(base, base.substring(0, 200));

                            // Skip saving if file size is larger than allowed
                            let bufferSize = newFile.response.body.toString().length;
                            if (bufferSize > this.defaultOptions.sizeLimit) {
                                this.warnings.push({
                                    message: `File is larger than allowed`,
                                    context: src,
                                    slug: item.postContext?.slug || null,
                                    details: `This file size is ${prettyBytes(bufferSize)}, the maximum file size is ${prettyBytes(this.defaultOptions.sizeLimit)}`
                                });

                                this.logger.warn({message: `File is larger than allowed ${src} (This bytes: ${bufferSize} / Max bytes: ${this.defaultOptions.sizeLimit})`});

                                return false;
                            }

                            let newLocal = await this.fileCache.writeContentFile(newFile.response.body, imageOptions);
                            item.newLocal = newLocal;

                            this.AssetCache.add(item);
                        }
                    } catch (error) {
                        this.logger.error({message: `Failed to save image ${src}`, src, error});
                    }
                }
            });
        });

        return tasks;
    }

    /**
     * Create & run tasks to update asset references
     */
    updateReferences() {
        let initialValueString = JSON.stringify(this._initialValue);
        this._fixedValues = initialValueString;

        let tasks = [];

        this._foundAssets.forEach((item) => {
            const foundItem = this.AssetCache.find(item);

            if (!foundItem || !foundItem.newLocal) {
                return false;
            }

            tasks.push({
                title: `Replace: ${foundItem.remote}`,
                skip: () => {
                    if (!foundItem || !foundItem.newLocal) {
                        return 'No cache file found';
                    }
                },
                task: async () => {
                    let trimmedRemote = item.remote.trim();
                    this._fixedValues = replaceAll(this._fixedValues, trimmedRemote, foundItem.newLocal);

                    if (this?.ctx?.options?.assetAltReplace) {
                        this._fixedValues = this._fixedValues.replaceAll(trimmedRemote, foundItem.newLocal);
                    } else {
                        this._fixedValues = replaceAll(this._fixedValues, trimmedRemote, foundItem.newLocal);
                    }

                    // Add an artificial delay here so tasks are shown properly
                    if (this?.ctx?.options?.assetDelay) {
                        await new Promise(r => setTimeout(r, 200)); // eslint-disable-line no-promise-executor-return
                    } else {
                        await new Promise(r => setTimeout(r, 2)); // eslint-disable-line no-promise-executor-return
                    }
                }
            });
        });

        return tasks;
    }

    /**
     * Do it all
     * @param {String|Object} value The JSON object or string
     *
     * @example
     * tasks('{""}');
     * tasks(mobiledocObject);
     */
    fetch(ctx) {
        let jsonData = (typeof ctx === 'string') ? JSON.parse(ctx) : ctx;

        jsonData = jsonData.result || jsonData;

        this._initialValue = jsonData;

        let tasks = [];

        /**
         * If we have cached asset files, load them in
         */
        tasks.push({
            title: 'Initializing AssetScraper cache',
            task: async () => {
                await this.AssetCache.load();
            }
        });

        /**
         * Loops over the supplied data and where needed, expands the object, Mobiledoc, or HTML,
         * to find any asset references, and saves them, ignoring duplicates and blocked domains.
         */
        tasks.push({
            title: 'Finding files',
            task: (ctx) => { // eslint-disable-line no-shadow
                this.findInObject(jsonData, ctx);
            }
        });

        /**
         * For each asset, get its file type
         */
        tasks.push({
            title: 'Finding file types',
            task: async (ctx, task) => { // eslint-disable-line no-shadow
                const fileTypeTasks = this.applyFileTypes();

                return task.newListr(fileTypeTasks, {
                    renderer: (ctx.options.verbose) ? 'verbose' : SmartRenderer,
                    concurrent: 5
                });
            }
        });

        /**
         * For each file that we have data for, and is allowed to be downloaded, download it
         */
        tasks.push({
            title: 'Downloading files',
            task: async (ctx, task) => { // eslint-disable-line no-shadow
                let downloadTasks = this.downloadFiles(ctx);

                return task.newListr(downloadTasks, {
                    renderer: (ctx.options.verbose) ? 'verbose' : SmartRenderer,
                    concurrent: 5
                });
            }
        });

        /**
         * Find & replace the old asset references with the newly saved local references
         */
        tasks.push({
            title: 'Fixing asset references',
            task: async (ctx, task) => { // eslint-disable-line no-shadow
                const updateRefTasks = this.updateReferences();
                // NOTE: This should always run one task at a time, otherwise some replacements could fail
                return task.newListr(updateRefTasks, {
                    renderer: (ctx.options.verbose) ? 'verbose' : SmartRenderer,
                    concurrent: 1
                });
            }
        });

        /**
         * We're all done now. Update the originally given object with the final updated data
         */
        tasks.push({
            title: 'Finalizing',
            task: async (ctx) => { // eslint-disable-line no-shadow
                const update = this.finalObjectValue();

                if (ctx.result) {
                    ctx.result = update;
                } else {
                    ctx = update;
                }
            }
        });

        return tasks;
    }
}
