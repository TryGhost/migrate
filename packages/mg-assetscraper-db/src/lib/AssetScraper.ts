import {parse, join, basename, extname} from 'node:path';
import {writeFileSync} from 'node:fs';
import errors from '@tryghost/errors';
import request from '@tryghost/request';
import {slugify} from '@tryghost/string';
import SmartRenderer, {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {fileTypeFromBuffer} from 'file-type';
import transliterate from 'transliteration';
import sharp from 'sharp';
import AssetCache from './AssetCache.js';

// Taken from https://github.com/TryGhost/Ghost/blob/main/ghost/core/core/shared/config/overrides.json
const knownImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/webp', 'image/avif', 'image/heif'];
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

    #settingsKeys: string[];
    #keys: string[];
    // #postObjectKeys: string[];
    // #userObjectKeys: string[];
    // #tagObjectKeys: string[];
    #ctx: any;

    #foundItems: string[];

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
                // Silently fail so we return false later
            }
        }

        return false;
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
            body = await sharp(body).webp({lossless: true}).toBuffer();

            const newFileInfo: any = await fileTypeFromBuffer(body);
            extension = newFileInfo.ext;
            fileMime = newFileInfo.mime;
        }

        if (!extension && !fileMime) {
            // console.log(`No file extension or mime found in response for file: ${requestURL}`);
            return null;
        }

        const removeExtRegExp = new RegExp(`.${extension}`, '');
        const fileName = parse(requestURL).base;
        const fileNameNoExt = fileName.replace(removeExtRegExp, '');

        const filePathNoFileName = new URL(requestURL).pathname.replace(/^\//, '').replace(fileName, '');

        // CASE: Query strings _can_ form part of the unique image URL, so rather that strip them include the in the file name
        // Then trim to last 248 chars (this will be more unique than the first 248), and trim leading & trailing dashes.
        // 248 is on the lower end of limits from various OSes and file systems
        const newFileName = slugify(parse(fileNameNoExt).base, {
            requiredChangesOnly: true
        }).slice(-248).replace(/^-|-$/, '');

        return {
            fileBuffer: body,
            fileName: join(filePathNoFileName, `${newFileName}.${extension}`),
            fileMime: fileMime,
            extension: `.${extension}`
        };
    }

    async resolveFileName(src: string, folder: string) {
        const assetUrl = new URL(src);

        const fileExtension = extname(assetUrl.pathname);
        const nameNoExtension = basename(assetUrl.pathname, fileExtension);

        // Decode the path, transliterate it, slugify it, then replace the encoded basename with that
        const decodedPathname = decodeURI(nameNoExtension);
        const transliteratedBasename = transliterate.slugify(basename(decodedPathname, fileExtension), {
            separator: '-'
        });
        assetUrl.pathname = assetUrl.pathname.replace(nameNoExtension, `${transliteratedBasename}`);

        // If there is a search string, slugify it and add it before the extension
        if (assetUrl.search) {
            assetUrl.pathname = assetUrl.pathname.replace(assetUrl.pathname, `${nameNoExtension}-${slugify(assetUrl.search)}${fileExtension}`);
            assetUrl.search = '';
        }

        // If there is a hash, slugify it and add it before the extension
        if (assetUrl.hash) {
            assetUrl.pathname = assetUrl.pathname.replace(assetUrl.pathname, `${nameNoExtension}-${slugify(assetUrl.hash)}${fileExtension}`);
            assetUrl.hash = '';
        }

        const assetFile = this.fileCache.resolveFileName(assetUrl.pathname, folder);

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

        // Overwrite the pathname wit the fileName from the downloaded asset, as the format & ext may be different
        let newSrc = new URL(src);
        newSrc.pathname = media.fileName;
        src = newSrc.toString();

        const assetFile = await this.resolveFileName(src, folder);

        let imageOptions = Object.assign(assetFile, {optimize: this.defaultOptions.optimize});

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
        const {id: cacheId, localPath} = await this.assetCache.add(src);

        // Check the cache to see if we have a local src. If we do, use that to replace the found src
        if (localPath) {
            content = await this.replaceSrc(src, localPath, content);
            return {
                path: localPath,
                content
            };
        }

        // Get the file
        const response = await this.getRemoteMedia(src);

        if (!response) {
            // logging.warn(`Failed to download remote media: ${src}`);
            await this.assetCache.update(cacheId, 'skip', 'no response');
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
    }

    async findMatchesInString(content: any) {
        const theMatches: string[] = [];

        for (const domain of this.allowedDomains) {
            // NOTE: the src could end with a quote, apostrophe or double-backslash, comma, space, or ) - hence the termination symbols
            const srcTerminationSymbols = `"|\\)|'| |,|<|\\\\|&quot;`;
            const regex = new RegExp(`(${domain}.*?)(${srcTerminationSymbols})`, 'igm');
            const matchResult = content.matchAll(regex);
            const matches: any = Array.from(matchResult, (match: any) => match[1]);

            theMatches.push(...matches);
        }

        return theMatches;
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
                concurrent: false
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
