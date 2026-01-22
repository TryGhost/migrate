/* c8 ignore start */
import {parse, join, basename, extname} from 'node:path';
import {createHash} from 'node:crypto';
import errors from '@tryghost/errors';
import {slugify} from '@tryghost/string';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {fileTypeFromBuffer} from 'file-type';
import transliterate from 'transliteration';
import AssetCache from './AssetCache.js';
import {needsConverting, convertImageBuffer, getFolderForMimeType, sanitizePathSegment} from './utils.js';

import type {ListrTask} from 'listr2';
import type {
    FileCache,
    AssetScraperOptions,
    AssetScraperContext,
    RemoteMediaResponse,
    MediaData,
    Logger,
    GhostContentObject,
    SettingsItem,
    CustomThemeSettingsItem,
    NewsletterItem,
    DownloadResult,
    FailedDownload,
    AssetCacheEntry
} from './types.js';

const DEFAULT_BLOCKED_DOMAINS: (string | RegExp)[] = [
    'https://images.unsplash.com', // Unsplash
    'https://www.gravatar.com', // Gravatar
    new RegExp('^https?://([a-z0-9-]+.)?cdninstagram.com'), // Instagram CDN
    new RegExp('^https?://(www.)?instagram.com'), // Instagram website
    new RegExp('^https?://([a-z0-9-]+.)?([a-z]+.)?fbcdn.net'), // Facebook CDN
    new RegExp('^https?://(www.)?facebook.com'), // Facebook website
    new RegExp('^https?://([a-z0-9-]+\\.)?ytimg\\.com'), // YouTube images
    new RegExp('^https?://(www.)?(youtube.com|youtu.be)'), // YouTube website
    new RegExp('^https?://([a-z0-9-]+.)?twitter.com'), // Twitter website
    new RegExp('^https?://([a-z0-9-]+.)?x.com'), // Worse Twitter
    new RegExp('^https?://([a-z0-9-]+.)?twimg.com'), // Twitter images
    new RegExp('^https?://(www.)?amazon.[a-z]{2,}'), // Amazon website, across all locales
    new RegExp('^https?://([a-z]+.)?media-amazon.com'), // Amazon images
    new RegExp('^https?://(www.)?ebay.[a-z]{2,}'), // EBay website, across all locales
    new RegExp('https?://i.ebayimg.com'), // EBay images
    new RegExp('^https?://(www.)?etsy.[a-z]{2,}'), // Etsy website, across all locales
    new RegExp('https?://i.etsystatic.com') // Etsy images
];

export default class AssetScraper {
    fileCache: FileCache;
    findOnlyMode: boolean;
    baseUrl: string | false;
    defaultOptions: Required<Pick<AssetScraperOptions, 'optimize' | 'allowImages' | 'allowMedia' | 'allowFiles'>>;
    warnings: string[];
    logger: Logger | undefined;
    allowedDomains: string[];
    allowAllDomains: boolean;
    blockedDomains: (string | RegExp)[];
    assetCache: AssetCache;
    processBase64Images: boolean;

    #settingsKeys: string[];
    #keys: Array<keyof GhostContentObject>;
    #ctx: AssetScraperContext;
    #foundItems: string[];
    #failedDownloads: FailedDownload[];

    constructor(fileCache: FileCache, options: AssetScraperOptions = {}, ctx: AssetScraperContext = {}) {
        this.fileCache = fileCache;

        this.defaultOptions = {
            optimize: options.optimize ?? true,
            allowImages: options.allowImages ?? true,
            allowMedia: options.allowMedia ?? true,
            allowFiles: options.allowFiles ?? true
        };

        // Set the  base URL, but also trim thr trailing slash
        this.baseUrl = options.baseUrl ? options.baseUrl.replace(/\/$/, '') : false;
        this.findOnlyMode = options?.findOnlyMode ?? false;
        this.allowedDomains = options?.domains ?? [];
        this.allowAllDomains = options?.allowAllDomains ?? false;

        if (this.allowedDomains.length === 0 && !this.allowAllDomains) {
            throw new errors.ValidationError({
                message: 'AssetScraper requires either `domains` or `allowAllDomains: true`'
            });
        }

        this.blockedDomains = [...DEFAULT_BLOCKED_DOMAINS, ...(options?.blockedDomains ?? [])];
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
        this.assetCache = new AssetCache({
            fileCache: this.fileCache
        });
    }

    async init() {
        await this.assetCache.init();
    }

    async getRemoteMedia(requestURL: string): Promise<RemoteMediaResponse> {
        // Enforce http - http > https redirects are commonplace
        const updatedRequestURL = requestURL.replace(/^\/\//g, 'http://');

        // Encode to handle special characters in URLs
        const encodedRequestURL = encodeURI(updatedRequestURL);

        const fetchOptions = {
            redirect: 'follow' as const,
            signal: AbortSignal.timeout(60000)
        };

        try {
            const response = await fetch(updatedRequestURL, fetchOptions);

            const arrayBuffer = await response.arrayBuffer();
            return {
                body: Buffer.from(arrayBuffer),
                headers: {
                    'content-type': response.headers.get('content-type') ?? undefined
                },
                statusCode: response.status
            };
        } catch {
            try {
                const response = await fetch(encodedRequestURL, fetchOptions);

                const arrayBuffer = await response.arrayBuffer();
                return {
                    body: Buffer.from(arrayBuffer),
                    headers: {
                        'content-type': response.headers.get('content-type') ?? undefined
                    },
                    statusCode: response.status
                };
            } catch (err: any) {
                throw new errors.InternalServerError({message: 'Failed to get remote media', err});
            }
        }
    }

    async extractFileDataFromResponse(requestURL: string, response: RemoteMediaResponse): Promise<MediaData | null> {
        let extension: string | undefined;
        let fileMime: string | undefined;
        let body = response.body;

        // Attempt to get the file extension from the file itself
        // If that fails, or if `.ext` is undefined, get the extension from the file path in the catch
        try {
            const fileInfo = await fileTypeFromBuffer(body);
            if (fileInfo) {
                extension = fileInfo.ext;
                fileMime = fileInfo.mime;
            }
        } catch {
            const headers = response.headers;
            fileMime = headers['content-type'];
            // const extensionFromPath = parse(requestURL).ext.split(/[^a-z]/i).filter(Boolean)[0];
            // extension = mime.extension(contentType) || extensionFromPath;
        }

        // If mime is in array, it needs converting to a supported image format.
        if (fileMime && needsConverting.includes(fileMime)) {
            const converted = await convertImageBuffer(body, fileMime);
            body = converted.buffer;
            extension = converted.extension;
            fileMime = converted.mime;
        }

        if (!extension || !fileMime) {
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
        const dirNoScheme = sanitizePathSegment(parsedSrc.dir.replace(assetUrl.protocol, '').replace(/^\/?\/?/, ''));

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
        const decodedFileName = sanitizePathSegment(decodeURIComponent(fileNameNoExtOrSearch));

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

    async storeMediaLocally(src: string, media: MediaData | null): Promise<string | null> {
        if (!media || !media.fileMime) {
            // console.log(`No file mime found for file: ${src}`);
            return null;
        }

        const folder = getFolderForMimeType(media.fileMime);

        if (!folder) {
            // console.log(`No storage folder found for file mime: ${media.fileMime}`);
            return null;
        }

        const assetFile = await this.resolveFileName(src, folder, media.extension);

        let imageOptions = Object.assign(assetFile, {optimize: this.defaultOptions.optimize});

        let newLocal = await this.fileCache.writeContentFile(media.fileBuffer, imageOptions);

        return newLocal;
    }

    async storeBase64MediaLocally(media: MediaData | null): Promise<string | null> {
        if (!media || !media.fileMime) {
            return null;
        }

        const folder = getFolderForMimeType(media.fileMime);

        if (!folder) {
            return null;
        }

        // For base64 images, use the filename directly without resolving URLs
        const imageOptions = {
            filename: media.fileName,
            outputPath: `/content/${folder}/${media.fileName}`,
            optimize: this.defaultOptions.optimize
        };

        const newLocal = await this.fileCache.writeContentFile(media.fileBuffer, imageOptions);

        return newLocal;
    }

    async replaceSrc(src: string, inlinedSrc: string, content: string): Promise<string> {
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

    async downloadExtractSave(src: string, content: string): Promise<DownloadResult> {
        // Create a cache item, or find a existing item
        const cacheEntry = await this.assetCache.add(src) as AssetCacheEntry;
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

    async downloadExtractSaveBase64(dataUri: string, content: string): Promise<DownloadResult> {
        // Create a hash of the data URI to use as cache key
        const hash = createHash('md5').update(dataUri).digest('hex');
        const cacheKey = `base64-${hash}`;

        // Create a cache item, or find an existing item
        const cacheEntry = await this.assetCache.add(cacheKey) as AssetCacheEntry;
        const {id: cacheId, localPath} = cacheEntry;

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

    async findMatchesInString(content: string): Promise<string[]> {
        if (this.allowAllDomains) {
            return this.findAllUrlsExceptBlocked(content);
        }
        return this.findUrlsFromAllowedDomains(content);
    }

    private findUrlsFromAllowedDomains(content: string): string[] {
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

    private findAllUrlsExceptBlocked(content: string): string[] {
        // Match any http/https URL with same termination symbols as allowedDomains matching
        const srcTerminationSymbols = `("|\\)|'|(?=(?:,https?))| |<|\\\\|&quot;|$)`;
        const urlRegex = new RegExp(`(https?://[^\\s"'<>)\\\\,]+?)(${srcTerminationSymbols})`, 'igm');
        const matches = content.matchAll(urlRegex);

        let matchesArray = Array.from(matches, (m: any) => m[1]);

        // Trim trailing commas from each match
        matchesArray = matchesArray.map((item) => {
            return item.replace(/,$/, '');
        });

        const noAllowedDomains = this.allowedDomains.length === 0;
        const noCustomBlockedDomains = this.blockedDomains.length === DEFAULT_BLOCKED_DOMAINS.length;
        const requireFileExtension = noAllowedDomains && noCustomBlockedDomains;

        return matchesArray.filter((url) => {
            if (this.isBlockedDomain(url)) {
                return false;
            }

            if (requireFileExtension && !this.hasFileExtension(url)) {
                return false;
            }

            return true;
        });
    }

    private isBlockedDomain(url: string): boolean {
        if (this.blockedDomains.length === 0) {
            return false;
        }

        for (const blocked of this.blockedDomains) {
            if (blocked instanceof RegExp) {
                if (blocked.test(url)) {
                    return true;
                }
            } else {
                // Prefix match for plain URLs
                if (url.startsWith(blocked)) {
                    return true;
                }
            }
        }
        return false;
    }

    private hasFileExtension(url: string): boolean {
        try {
            const pathname = new URL(url).pathname;
            // Check if pathname ends with a file extension (e.g., .jpg, .png, .mp4)
            return /\.[a-z0-9]+$/i.test(pathname);
        } catch {
            return false;
        }
    }

    async findBase64ImagesInString(content: string): Promise<string[]> {
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

    async extractFileDataFromBase64(dataUri: string): Promise<MediaData | null> {
        // Parse the data URI to extract mime type and base64 data
        const matches = dataUri.match(/^data:image\/([^;]+);base64,(.+)$/);

        if (!matches) {
            return null;
        }

        const mimeType = `image/${matches[1]}`;
        const base64Data = matches[2];

        // Decode base64 to buffer
        let body: Buffer = Buffer.from(base64Data, 'base64');

        // Generate a hash of the buffer for a consistent filename (for deduplication)
        const hash = createHash('md5').update(body).digest('hex');

        // Get file type from buffer
        let extension;
        let fileMime = mimeType;

        try {
            const fileInfo = await fileTypeFromBuffer(body);
            if (fileInfo) {
                extension = fileInfo.ext;
                fileMime = fileInfo.mime;
            }
        } catch {
            // Fallback to the mime from the data URI
            const mimeToExtMap: Record<string, string> = {
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
            const converted = await convertImageBuffer(body, fileMime);
            body = converted.buffer;
            extension = converted.extension;
            fileMime = converted.mime;
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

    async normalizeUrl(src: string): Promise<string> {
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

    async inlineContent(content: string): Promise<string> {
        // Process base64 images first if enabled
        if (this.processBase64Images) {
            const base64Matches = await this.findBase64ImagesInString(content);

            for (const dataUri of base64Matches) {
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

        for (const src of matches) {
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

    async inlinePostTagUserObject(post: GhostContentObject): Promise<void> {
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

        for (const item of this.#keys) {
            const value = post[item];
            if (!value || typeof value !== 'string') {
                continue;
            }

            const newSrc = await this.downloadExtractSave(value, value);
            post[item] = this.localizeSrc(newSrc.path);
        }
    }

    async doSettingsObject(settings: SettingsItem[]): Promise<void> {
        for (const [index, {key, value}] of settings.entries()) {
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

    async doCustomThemeSettingsObject(settings: CustomThemeSettingsItem[]): Promise<void> {
        for (const [index, {type, value}] of settings.entries()) {
            if (type !== 'image' || !value) {
                continue;
            }
            const absoluteSrc = await this.normalizeUrl(value);
            const newSrc = await this.downloadExtractSave(absoluteSrc, absoluteSrc);
            settings[index].value = this.localizeSrc(newSrc.path);
        }
    }

    async doNewslettersObject(newsletters: NewsletterItem[]): Promise<void> {
        for (const newsletter of newsletters) {
            for (const item of this.#keys) {
                const value = newsletter[item as keyof NewsletterItem] as string | undefined;
                if (!value) {
                    continue;
                }

                const newSrc = await this.downloadExtractSave(value, value);
                (newsletter as Record<string, string>)[item] = this.localizeSrc(newSrc.path);
            }
        }
    }

    get foundItems() {
        return this.#foundItems;
    }

    get failedDownloads() {
        return this.#failedDownloads;
    }

    getTasks(): ListrTask[] {
        const tasks: ListrTask[] = [];

        const addTasks = (items: GhostContentObject[], type: string): void => {
            items.forEach((item: GhostContentObject) => {
                tasks.push({
                    title: `Assets for ${type} ${item?.slug ?? item?.name ?? item.id ?? item.post_id}`,
                    task: async () => {
                        try {
                            await this.inlinePostTagUserObject(item);
                        } catch (err) {
                            throw new errors.InternalServerError({message: 'Failed to inline object', err: err instanceof Error ? err : undefined});
                        }
                    }
                });
            });
        };

        const addSubTasks = (items: GhostContentObject[], type: string) => {
            const subTasks: ListrTask[] = [];

            items.forEach((item: GhostContentObject) => {
                subTasks.push({
                    title: `Assets for ${type} ${item?.slug ?? item?.name ?? item.id ?? item.post_id}`,
                    task: async () => {
                        try {
                            await this.inlinePostTagUserObject(item);
                        } catch (err) {
                            throw new errors.InternalServerError({message: 'Failed to inline object', err: err instanceof Error ? err : undefined});
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
                return addSubTasks(theSnippets, 'snippets');
            }
        });

        // Newsletters
        const theNewsletters = this.#ctx?.newsletters ?? this.#ctx?.result?.data?.newsletters ?? [];
        tasks.push({
            title: `Newsletters`,
            task: async () => {
                await this.doNewslettersObject(theNewsletters);
            }
        });

        return tasks;
    }
}
