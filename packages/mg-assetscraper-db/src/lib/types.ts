/* c8 ignore start */

// ============================================================================
// File Cache Interface (from @tryghost/mg-fs-utils)
// ============================================================================

export interface ResolvedFileName {
    filename: string;
    storagePath: string;
    outputPath: string;
}

export interface WriteContentOptions {
    filename: string;
    storagePath?: string;
    outputPath: string;
    optimize: boolean;
}

export interface FileCache {
    tmpDir: string;
    resolveFileName(basePath: string, folder: string): ResolvedFileName;
    writeContentFile(buffer: Buffer, options: WriteContentOptions): Promise<string>;
    emptyCurrentCacheDir(): Promise<void>;
    hasFile?(path: string, location?: string): boolean;
    writeTmpFileSync?(content: string, path: string, createDir?: boolean): void;
}

// ============================================================================
// Asset Scraper Options
// ============================================================================

export interface AssetScraperOptions {
    optimize?: boolean;
    baseUrl?: string;
    findOnlyMode?: boolean;
    domains?: string[];
    allowAllDomains?: boolean;
    blockedDomains?: (string | RegExp)[];
    processBase64Images?: boolean;
}

// ============================================================================
// Remote Media Response
// ============================================================================

export interface RemoteMediaResponse {
    body: Buffer;
    statusCode: number;
    headers: {
        'content-type'?: string;
        [key: string]: string | undefined;
    };
}

// ============================================================================
// Media/File Data
// ============================================================================

export interface MediaData {
    fileBuffer: Buffer;
    fileName: string;
    fileMime: string;
    extension: string;
}

// ============================================================================
// Ghost Data Objects
// ============================================================================

export interface GhostImageKeys {
    src?: string;
    feature_image?: string;
    profile_image?: string;
    cover_image?: string;
    header_image?: string;
    og_image?: string;
    twitter_image?: string;
    thumbnailSrc?: string;
    customThumbnailSrc?: string;
    productImageSrc?: string;
}

export interface GhostContentObject extends GhostImageKeys {
    id?: string | number;
    post_id?: string | number;
    slug?: string;
    name?: string;
    lexical?: string;
    html?: string;
    mobiledoc?: string;
    codeinjection_head?: string;
    codeinjection_foot?: string;
}

export interface SettingsItem {
    key: string;
    value: string;
}

export interface CustomThemeSettingsItem {
    id?: string;
    theme?: string;
    key: string;
    type: string;
    value: string;
}

export interface NewsletterItem extends GhostImageKeys {
    id?: string;
    name?: string;
    slug?: string;
}

// ============================================================================
// Asset Scraper Context
// ============================================================================

export interface AssetScraperContext {
    posts?: GhostContentObject[];
    posts_meta?: GhostContentObject[];
    tags?: GhostContentObject[];
    users?: GhostContentObject[];
    settings?: SettingsItem[];
    custom_theme_settings?: CustomThemeSettingsItem[];
    snippets?: GhostContentObject[];
    newsletters?: NewsletterItem[];
    warnings?: string[];
    logger?: Logger;
    result?: {
        data?: {
            posts?: GhostContentObject[];
            posts_meta?: GhostContentObject[];
            tags?: GhostContentObject[];
            users?: GhostContentObject[];
            settings?: SettingsItem[];
            custom_theme_settings?: CustomThemeSettingsItem[];
            snippets?: GhostContentObject[];
            newsletters?: NewsletterItem[];
        };
    };
}

// ============================================================================
// Logger Interface
// ============================================================================

export interface Logger {
    info?(message: string, ...args: unknown[]): void;
    warn?(message: string, ...args: unknown[]): void;
    error?(message: string, ...args: unknown[]): void;
    debug?(message: string, ...args: unknown[]): void;
}

// ============================================================================
// Asset Cache Types
// ============================================================================

export interface AssetCacheEntry {
    id: number;
    src: string;
    status?: number;
    localPath?: string;
    skip?: string;
}

export interface AssetCacheOptions {
    fileCache: FileCache;
}

// ============================================================================
// Download Result
// ============================================================================

export interface DownloadResult {
    path: string;
    content: string;
}

// ============================================================================
// Failed Download Entry
// ============================================================================

export interface FailedDownload {
    url: string;
    error: string;
}
