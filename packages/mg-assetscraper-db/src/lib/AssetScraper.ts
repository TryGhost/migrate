/* c8 ignore start */
import {parse, join, basename, extname} from 'node:path';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import errors from '@tryghost/errors';
import request from '@tryghost/request';
import {slugify} from '@tryghost/string';
import SmartRenderer, {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {fileTypeFromBuffer} from 'file-type';
import transliterate from 'transliteration';
import sharp from 'sharp';
import convert from 'heic-convert';
import AssetCache from './AssetCache.js';

// Taken from https://github.com/TryGhost/Ghost/blob/main/ghost/core/core/shared/config/overrides.json
const knownImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/webp', 'image/avif', 'image/heif', 'image/heic'];
const knownMediaTypes = ['video/mp4', 'video/webm', 'video/ogg', 'audio/mpeg', 'audio/vnd.wav', 'audio/wave', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];
const knownFileTypes = ['application/pdf', 'application/json', 'application/ld+json', 'application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.text', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/rtf', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/xml', 'application/atom+xml'
];
const knownTypes = [...knownImageTypes, ...knownMediaTypes, ...knownFileTypes];

const needsConverting = ['image/avif', 'image/heif', 'image/heic'];

export default class AssetScraper {
    /**
     * The idea is:
     *
     * - Loop over posts, meta, tags, settings, one by one. Any object that _could_ have an image src in it, loop over that as a single task.
     *  - When an asset is found, do the file type check and download right then, don't just add to the cache and move on
     *  - Save the result (response status, new URL is applicable, etc) to the cache
     * - When an asset is found, check the cache first as the asset might be downloaded already
     *
     * This will be more difficult to show a number of tasks, but the number of posts will have to do.
     * Don't deviate from this, because complexity will grow massively
     *
     * Take inspiration from the external media inliner, as some of this may make sense there too
     */

    fileCache: any;
    findOnlyMode: Boolean;
    baseUrl: string | Boolean;
    defaultOptions: any;
    warnings: any;
    logger: any;
    allowedDomains: string[];
    assetCache: AssetCache;
    processBase64Images: boolean;

    #settingsKeys: string[];
    #keys: string[];
    // #postObjectKeys: string[];
    // #userObjectKeys: string[];
    // #tagObjectKeys: string[];
    #ctx: any;

    #foundItems: string[];
    #failedDownloads: Array<{url: string; error: string}>;

    constructor(fileCache: any, options: any, ctx: any = {}) {
        this.fileCache = fileCache;

        this.defaultOptions = Object.assign({
            optimize: true,
            // sizeLimit: false,
            allowImages: true,
            allowMedia: true,
            allowFiles: true
        }, options);

        // Set the  base URL, but also trim thr trailing slash
        this.baseUrl = (options?.baseUrl) ? options.baseUrl.replace(/\/$/, '') : false;

        this.findOnlyMode = options?.findOnlyMode ?? false;

        this.allowedDomains = options?.domains ?? [];

        this.processBase64Images = options?.processBase64Images ?? false;

        this.warnings = (ctx.warnings) ? ctx.warnings : [];

        this.logger = ctx.logger;

        this.#ctx = ctx;

        this.#settingsKeys = [
            'logo',
            'cover_image',
            'icon',
            'og_image',
            'twitter_image',
            'portal_button_icon'
        ];

        this.#keys = [
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

        this.#foundItems = [];
        this.#failedDownloads = [];

        // TODO: Custom theme settings
        // Any objects where `"type": "image"`, look for assets in `value`

        this.assetCache = new AssetCache({
            // folderPath: options.assetCachePath
            fileCache: this.fileCache
        });
    }

    async init() {
        await this.assetCache.init();
    }

    /**
     *
     * @param {string} requestURL - url of remote media
     * @returns {Promise<Object>}
     */
    async getRemoteMedia(requestURL: string) {
        // Enforce http - http > https redirects are commonplace
        const updatedRequestURL = requestURL.replace(/^\/\//g, 'http://');

        // Encode to handle special characters in URLs
        const encodedRequestURL = encodeURI(updatedRequestURL);

        try {
            const response = await request(updatedRequestURL, {
                followRedirect: true,
                responseType: 'buffer'
            });

            return response;
        } catch {
            try {
                const responseWithEncodedUrl = await request(encodedRequestURL, {
                    followRedirect: true,
                    responseType: 'buffer'
                });

                return responseWithEncodedUrl;
            } catch (err: any) {
                throw new errors.InternalServerError({message: 'Failed to get remote media', err});
            }
        }
    }

    /**
     *
     * @param {Object} response - response from request
     * @returns {Object}
     */
    async extractFileDataFromResponse(requestURL: any, response: any) {
        let extension;
        let fileMime;
        let body = response.body;

        // Attempt to get the file extension from the file itself
        // If that fails, or if `.ext` is undefined, get the extension from the file path in the catch
        try {
            const fileInfo: any = await fileTypeFromBuffer(body);
            // console.log({fileInfo});
            extension = fileInfo.ext;
            fileMime = fileInfo.mime;
        } catch {
            const headers = response.headers;
            fileMime = headers['content-type'];
            // const extensionFromPath = parse(requestURL).ext.split(/[^a-z]/i).filter(Boolean)[0];
            // extension = mime.extension(contentType) || extensionFromPath;
        }

        // If mime is in array, it needs converting to a supported image format.
        // To do that, convert the inout buffer to a webp buffer.
        if (needsConverting.includes(fileMime)) {
            if (fileMime === 'image/heic' || fileMime === 'image/heif') {
                body = await convert({
                    buffer: body,
                    format: 'JPEG'
                });
            } else {
                body = await sharp(body).webp({lossless: true}).toBuffer();
            }

            const newFileInfo: any = await fileTypeFromBuffer(body);
            extension = newFileInfo.ext;
            fileMime = newFileInfo.mime;
        }

        if (!extension && !fileMime) {
            // console.log(`No file extension or mime found in response for file: ${requestURL}`);
            return null;
        }

        // const fileName = parse(requestURL).name + '.' + requestURL.split(/[#?]/)[0].split('.').pop().trim();
        const fileNameNoExt = parse(requestURL).name;

        // CASE: Query strings _can_ form part of the unique image URL, so rather that strip them include the in the file name
        // Then trim to last 248 chars (this will be more unique than the first 248), and trim leading & trailing dashes.
        // 248 is on the lower end of limits from various OSes and file systems
        const newFileName = slugify(parse(fileNameNoExt).base, {
            requiredChangesOnly: true
        }).slice(-248).replace(/^-|-$/, '');

        return {
            fileBuffer: body,
            fileName: `${newFileName}.${extension}`,
            fileMime: fileMime,
            extension: `.${extension}`
        };
    }

    async resolveFileName(src: string, folder: string, newExtension?: string) {
        const assetUrl = new URL(src);
        const parsedSrc = parse(src);

        // Get the dir (all of the URL up until the file name) with no scheme, so `example.com/path/to`
        const dirNoScheme = parsedSrc.dir.replace(assetUrl.protocol, '').replace(/^\/?\/?/, '').replace(/\./gm, '-').replace(/,/gm, '-').replace(/:/gm, '-');

        // Get the file name with no extension or search
        const fileNameNoExtOrSearch = parsedSrc.name;

        // And get the extension
        const fileExtension = extname(assetUrl.pathname);

        // Decode the path, transliterate it, slugify it, then replace the encoded basename with that
        const decodedPathname = decodeURI(fileNameNoExtOrSearch);
        const transliteratedBasename = transliterate.slugify(basename(decodedPathname, fileExtension), {
            separator: '-'
        });
        assetUrl.pathname = assetUrl.pathname.replace(fileNameNoExtOrSearch, `${transliteratedBasename}`);

        // Decode the file name, as it can sometimes be an encoded URL if used with a CDN or image manipulation service
        let decodedFileName = decodeURIComponent(fileNameNoExtOrSearch);
        decodedFileName = decodedFileName.replace(/\./g, '-');
        decodedFileName = decodedFileName.replace(/,/g, '-');
        decodedFileName = decodedFileName.replace(/:/g, '-');

        // Start an array of final file name parts, starting with the raw name itself
        const fileNameParts = [decodedFileName];

        // Add slugified search params if available
        if (assetUrl.search) {
            fileNameParts.push(slugify(assetUrl.search));
        }

        // Add a slugified hash if available
        if (assetUrl.hash) {
            fileNameParts.push(slugify(assetUrl.hash));
        }

        // Combine parts into a new string
        const theNewFileName = `${fileNameParts.filter(Boolean).join('-')}${newExtension ?? fileExtension}`;

        // Combine with the dir ath we made at start of this function
        let finalBasePath = join(...[dirNoScheme, theNewFileName].filter(Boolean));
        finalBasePath = finalBasePath.replace(/\?/g, '/');

        // And now pass this to the file cache, which returns:
        // {
        //     filename: 'path/to/photo.jpg',
        //     storagePath: '/content/images/path/to/photo.jpg',
        //     outputPath: 'the-temp-dir/1234/abcd//content/images/path/to/photo.jpg'
        // }
        const assetFile = this.fileCache.resolveFileName(finalBasePath, folder);

        return assetFile;
    }

    /**
     *
     * @param {String} src - The image src, used for the file name
     * @param {Object} media - media to store locally
     * @returns {Promise<string>} - path to stored media
     */
    async storeMediaLocally(src: string, media: any) {
        let folder = null;

        if (!media || !media.fileMime) {
            // console.log(`No file mime found for file: ${src}`);
            return null;
        }

        if (knownImageTypes.includes(media.fileMime)) {
            folder = 'images';
        } else if (knownMediaTypes.includes(media.fileMime)) {
            folder = 'media';
        } else if (knownFileTypes.includes(media.fileMime)) {
            folder = 'files';
        }

        if (!folder) {
            // console.log(`No storage folder found for file mime: ${media.fileMime}`);
            return null;
        }

        const assetFile = await this.resolveFileName(src, folder, media.extension);

        let imageOptions = Object.assign(assetFile, {optimize: this.defaultOptions.optimize});

        let newLocal = await this.fileCache.writeContentFile(media.fileBuffer, imageOptions);

        return newLocal;
    }

    async storeBase64MediaLocally(media: any) {
        let folder = null;

        if (!media || !media.fileMime) {
            return null;
        }

        if (knownImageTypes.includes(media.fileMime)) {
            folder = 'images';
        } else if (knownMediaTypes.includes(media.fileMime)) {
            folder = 'media';
        } else if (knownFileTypes.includes(media.fileMime)) {
            folder = 'files';
        }

        if (!folder) {
            return null;
        }

        // For base64 images, use the filename directly without resolving URLs
        const imageOptions = {
            filename: media.fileName,
            outputPath: `/content/${folder}/${media.fileName}`,
            optimize: this.defaultOptions.optimize
        };

        let newLocal = await this.fileCache.writeContentFile(media.fileBuffer, imageOptions);

        return newLocal;
    }

    async replaceSrc(src: string, inlinedSrc: string, content: string) {
        if (inlinedSrc.startsWith('/content/')) {
            const theRealSrc = this.localizeSrc(inlinedSrc);
            content = content.replace(src, theRealSrc);
        } else {
            // Don't do anything yet
        }

        return content;
    }

    localizeSrc(src: string) {
        if (src.startsWith('/content/')) {
            src = join('__GHOST_URL__', src);
        }

        return src;
    }

    async downloadExtractSave(src: string, content: string) {
        // Create a cache item, or find a existing item
        const cacheEntry: any = await this.assetCache.add(src);
        const {id: cacheId, localPath, skip} = cacheEntry;

        // Check the cache to see if we have a local src. If we do, use that to replace the found src
        if (localPath) {
            content = await this.replaceSrc(src, localPath, content);
            return {
                path: localPath,
                content
            };
        }

        // Check if this was previously attempted and failed
        if (skip) {
            // Don't try again, and don't add another failure record
            return {
                path: src,
                content
            };
        }

        try {
            // Get the file
            const response = await this.getRemoteMedia(src);

            if (!response) {
                // logging.warn(`Failed to download remote media: ${src}`);
                await this.assetCache.update(cacheId, 'skip', 'no response');
                this.#failedDownloads.push({url: src, error: 'No response from server'});
                return {
                    path: src,
                    content
                };
            }

            // Update the cache with the status code (for fault-finding later on)
            await this.assetCache.update(cacheId, 'status', response?.statusCode);

            const fileData = await this.extractFileDataFromResponse(src, response);

            // Store the file locally
            const filePath = await this.storeMediaLocally(src, fileData);
            if (!filePath) {
                await this.assetCache.update(cacheId, 'skip', 'no storage found');
                this.#failedDownloads.push({url: src, error: 'Failed to store media locally'});
                // logging.warn(`Failed to store media locally: ${src}`);
                return {
                    path: src,
                    content
                };
            }

            // Store the local path in the cache
            await this.assetCache.update(cacheId, 'localPath', filePath);

            return {
                path: filePath,
                content
            };
        } catch (error: any) {
            // Log the error and continue with other assets
            const errorMessage = error?.message || 'Unknown error';
            await this.assetCache.update(cacheId, 'skip', errorMessage);
            this.#failedDownloads.push({url: src, error: errorMessage});

            // Return original src so the content remains valid
            return {
                path: src,
                content
            };
        }
    }

    async downloadExtractSaveBase64(dataUri: string, content: string) {
        // Create a hash of the data URI to use as cache key
        const hash = createHash('md5').update(dataUri).digest('hex');
        const cacheKey = `base64-${hash}`;

        // Create a cache item, or find an existing item
        const {id: cacheId, localPath} = await this.assetCache.add(cacheKey);

        // Check the cache to see if we have a local src. If we do, use that to replace the found src
        if (localPath) {
            content = content.replace(dataUri, localPath);
            return {
                path: localPath,
                content
            };
        }

        // Extract file data from base64
        const fileData = await this.extractFileDataFromBase64(dataUri);

        if (!fileData) {
            await this.assetCache.update(cacheId, 'skip', 'invalid base64 data');
            return {
                path: dataUri,
                content
            };
        }

        // Store the file locally without calling resolveFileName for base64
        const filePath = await this.storeBase64MediaLocally(fileData);
        if (!filePath) {
            await this.assetCache.update(cacheId, 'skip', 'no storage found');
            return {
                path: dataUri,
                content
            };
        }

        // Store the local path in the cache
        await this.assetCache.update(cacheId, 'localPath', filePath);

        // Replace the data URI with the local path
        content = await this.replaceSrc(dataUri, filePath, content);

        return {
            path: filePath,
            content
        };
    }

    async findMatchesInString(content: any) {
        const theMatches: string[] = [];

        for (const domain of this.allowedDomains) {
            // NOTE: the src could end with a quote, apostrophe or double-backslash, comma, space, or ) - hence the termination symbols
            const srcTerminationSymbols = `("|\\)|'|(?=(?:,https?))| |<|\\\\|&quot;|$)`;
            const regex = new RegExp(`(${domain}.*?)(${srcTerminationSymbols})`, 'igm');
            const matches = content.matchAll(regex);

            // Simplify the matches so we only get the result needed
            let matchesArray = Array.from(matches, (m: any) => m[1]);

            // Trim trailing commas from each match
            matchesArray = matchesArray.map((item) => {
                return item.replace(/,$/, '');
            });

            theMatches.push(...matchesArray);
        }

        return theMatches;
    }

    async findBase64ImagesInString(content: any) {
        const theMatches: string[] = [];

        // Match data URI scheme for images: data:image/[mime-type];base64,[base64-data]
        // Termination symbols similar to URL matching
        const base64Regex = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi;
        const matches = content.matchAll(base64Regex);

        // Extract the full data URI from each match
        for (const match of matches) {
            theMatches.push(match[0]);
        }

        return theMatches;
    }

    /**
     * Extract file data from a base64 data URI
     * @param {string} dataUri - The base64 data URI (e.g., data:image/png;base64,...)
     * @returns {Object} File data similar to extractFileDataFromResponse
     */
    async extractFileDataFromBase64(dataUri: string) {
        // Parse the data URI to extract mime type and base64 data
        const matches = dataUri.match(/^data:image\/([^;]+);base64,(.+)$/);

        if (!matches) {
            return null;
        }

        const mimeType = `image/${matches[1]}`;
        const base64Data = matches[2];

        // Decode base64 to buffer
        let body = Buffer.from(base64Data, 'base64');

        // Generate a hash of the buffer for a consistent filename (for deduplication)
        const hash = createHash('md5').update(body).digest('hex');

        // Get file type from buffer
        let extension;
        let fileMime = mimeType;

        try {
            const fileInfo: any = await fileTypeFromBuffer(body);
            extension = fileInfo.ext;
            fileMime = fileInfo.mime;
        } catch {
            // Fallback to the mime from the data URI
            const mimeToExtMap: any = {
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
                'image/svg+xml': 'svg',
                'image/avif': 'avif',
                'image/heif': 'heif',
                'image/heic': 'heic'
            };
            extension = mimeToExtMap[mimeType] || 'jpg';
        }

        // If mime is in array, it needs converting to a supported image format
        if (needsConverting.includes(fileMime)) {
            if (fileMime === 'image/heic' || fileMime === 'image/heif') {
                body = await convert({
                    buffer: body,
                    format: 'JPEG'
                });
            } else {
                body = await sharp(body).webp({lossless: true}).toBuffer();
            }

            const newFileInfo: any = await fileTypeFromBuffer(body);
            extension = newFileInfo.ext;
            fileMime = newFileInfo.mime;
        }

        if (!extension && !fileMime) {
            return null;
        }

        // Use hash as filename for deduplication
        const fileName = `base64-${hash}.${extension}`;

        return {
            fileBuffer: body,
            fileName: fileName,
            fileMime: fileMime,
            extension: `.${extension}`
        };
    }

    async normalizeUrl(src: string) {
        // Replace the Ghost URL placeholder with the actual URL
        if (src.includes('__GHOST_URL__') && this.baseUrl && typeof this.baseUrl === 'string') {
            src = src.replace('__GHOST_URL__', this.baseUrl);
        }

        // If UTL is like `//example.com`, add `https:` to the start
        if (src.startsWith('//')) {
            src = `https:${src}`;
        }

        // If URL is relative, add the base URL
        if (src.startsWith('/')) {
            src = `${this.baseUrl}${src}`;
        }

        return src;
    }

    async inlineContent(content: any) {
        // Process base64 images first if enabled
        if (this.processBase64Images) {
            const base64Matches = await this.findBase64ImagesInString(content);

            for await (const dataUri of base64Matches) {
                // If in findOnlyMode, just push data URIs to an array and continue
                if (this.findOnlyMode) {
                    this.#foundItems.push(dataUri);
                    continue;
                }

                const result = await this.downloadExtractSaveBase64(dataUri, content);
                content = result.content;
            }
        }

        // Then process domain-based images
        const matches = await this.findMatchesInString(content);

        for await (const src of matches) {
            // If in findOnlyMode, just puch srcs to an array and continue
            if (this.findOnlyMode) {
                this.#foundItems.push(src);
                continue;
            }

            const absoluteSrc = await this.normalizeUrl(src);

            // const result = await this.downloadExtractSave(src, content);
            const result = await this.downloadExtractSave(absoluteSrc, content);

            content = result.content;
            const filePath = result.path;

            // Replace the newly inlined src in the content
            content = await this.replaceSrc(src, filePath, content);
        }

        return content;
    }

    async inlinePostTagUserObject(post: any) {
        if (post.lexical) {
            post.lexical = await this.inlineContent(post.lexical);
        }

        if (post.html) {
            post.html = await this.inlineContent(post.html);
        }

        if (post.codeinjection_head) {
            post.codeinjection_head = await this.inlineContent(post.codeinjection_head);
        }

        if (post.codeinjection_foot) {
            post.codeinjection_foot = await this.inlineContent(post.codeinjection_foot);
        }

        for await (const item of this.#keys) {
            if (!post[item]) {
                continue;
            }

            const newSrc = await this.downloadExtractSave(post[item], post[item]);
            post[item] = this.localizeSrc(newSrc.path);
        }
    }

    // TODO: Come up with a better name for these methods
    async doSettingsObject(settings: any) {
        for await (const [index, {key, value}] of settings.entries()) {
            if (settings[index].key === 'codeinjection_head') {
                settings[index].value = await this.inlineContent(settings[index].value);
            }

            if (settings[index].key === 'codeinjection_foot') {
                settings[index].value = await this.inlineContent(settings[index].value);
            }

            if (!this.#settingsKeys.includes(key)) {
                continue;
            }

            const newSrc = await this.downloadExtractSave(value, value);
            settings[index].value = this.localizeSrc(newSrc.path);
        }
    }

    async doCustomThemeSettingsObject(settings: any) {
        for await (const [index, {type, key, value}] of settings.entries()) {
            if (settings[index].type === 'image') {
                const absoluteSrc = await this.normalizeUrl(settings[index].value);
                settings[index].value = await this.inlineContent(absoluteSrc);
            }

            const absoluteSrc = await this.normalizeUrl(value);

            const newSrc = await this.downloadExtractSave(absoluteSrc, absoluteSrc);
            settings[index].value = this.localizeSrc(newSrc.path);
        }
    }

    get foundItems() {
        return this.#foundItems;
    }

    get failedDownloads() {
        return this.#failedDownloads;
    }

    getTasks() {
        const tasks: any = [];

        const addTasks = (items: any, type: string) => {
            items.forEach((item: any) => {
                tasks.push({
                    title: `Assets for ${type} ${item?.slug ?? item?.name ?? item.id ?? item.post_id}`,
                    task: async () => {
                        try {
                            item = await this.inlinePostTagUserObject(item);
                        } catch (err: any) {
                            throw new errors.InternalServerError({message: 'Failed to inline object', err});
                        }
                    }
                });
            });
        };

        const addSubTasks = (items: any, type: string) => {
            let subTasks: any = [];

            items.forEach((item: any) => {
                subTasks.push({
                    title: `Assets for ${type} ${item?.slug ?? item?.name ?? item.id ?? item.post_id}`,
                    task: async () => {
                        try {
                            item = await this.inlinePostTagUserObject(item);
                        } catch (err: any) {
                            throw new errors.InternalServerError({message: 'Failed to inline object', err});
                        }
                    }
                });
            });

            return makeTaskRunner(subTasks, {
                concurrent: 5
            });
        };

        // Posts
        const thePosts = this.#ctx?.posts ?? this.#ctx?.result?.data?.posts ?? [];
        tasks.push({
            title: `Posts`,
            task: async () => {
                return addSubTasks(thePosts, 'posts');
            }
        });

        // Posts Meta
        const thePostMeta = this.#ctx?.posts_meta ?? this.#ctx?.result?.data?.posts_meta ?? [];
        tasks.push({
            title: `Posts Meta`,
            task: async () => {
                return addSubTasks(thePostMeta, 'posts meta');
            }
        });

        // Tags
        const theTags = this.#ctx?.tags ?? this.#ctx?.result?.data?.tags ?? [];
        tasks.push({
            title: `Tags`,
            task: async () => {
                return addSubTasks(theTags, 'tags');
            }
        });

        // Users
        const theUsers = this.#ctx?.users ?? this.#ctx?.result?.data?.users ?? [];
        tasks.push({
            title: `Users`,
            task: async () => {
                return addSubTasks(theUsers, 'users');
            }
        });

        // Settings
        const theSettings = this.#ctx?.settings ?? this.#ctx?.result?.data?.settings ?? [];
        tasks.push({
            title: `Settings`,
            task: async () => {
                await this.doSettingsObject(theSettings);
            }
        });

        // Custom theme settings
        const customThemeSettings = this.#ctx?.custom_theme_settings ?? this.#ctx?.result?.data?.custom_theme_settings ?? [];
        tasks.push({
            title: `Custom theme settings`,
            task: async () => {
                await this.doCustomThemeSettingsObject(customThemeSettings);
            }
        });

        // Snippets
        const theSnippets = this.#ctx?.snippets ?? this.#ctx?.result?.data?.snippets ?? [];
        tasks.push({
            title: `Snippets`,
            task: async () => {
                // await this.doCustomThemeSettingsObject(customThemeSettings);
                // inlinePostTagUserObject
                addTasks(theSnippets, 'snippets');
            }
        });

        // tasks.push({
        //     title: 'Fetching assets in posts',
        //     task: async (ctx: any, task: any) => { // eslint-disable-line no-shadow
        //         let subTasks: any = [];

        //         let postsToLoopOver: any = null;

        //         if (this.#ctx.posts && this.#ctx.posts.length) {
        //             postsToLoopOver = this.#ctx.posts;
        //         } else if (this.#ctx.result.data.posts) {
        //             postsToLoopOver = this.#ctx.result.data.posts;
        //         } else {
        //             // this.logger.error('No data to loop over');
        //             throw new Error('No data to loop over');
        //         }

        //         postsToLoopOver.forEach((post: any) => {
        //             subTasks.push({
        //                 title: `Assets for post ${post?.slug ?? post.id}`,
        //                 task: async () => {
        //                     post = await this.doPostObject(post);
        //                 }
        //             });
        //         });

        //         // TODO: Also loop over these
        //         // users
        //         // tags

        //         // And the settings too, in its own special way

        //         // And custom_theme_settings

        //         return makeTaskRunner(subTasks, {
        //             concurrent: 5
        //         });

        //         // return task.newListr(subTasks, {
        //         //     // renderer: (ctx.options.verbose) ? 'verbose' : SmartRenderer,
        //         //     // renderer: SmartRenderer,
        //         //     concurrent: 5
        //         // });
        //     }
        // });

        return tasks;
    }
}
