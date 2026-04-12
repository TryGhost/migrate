import scrapeIt from 'scrape-it';
import omitEmpty from 'omit-empty';
import errors from '@tryghost/errors';
import {slugify} from '@tryghost/string';

export interface FileCache {
    hasFile(filename: string, type: string): boolean;
    readTmpJSONFile(filename: string): any;
    writeTmpFile(data: any, filename: string): any;
}

export interface ScrapeConfig {
    posts?: Record<string, any>;
    [key: string]: any;
}

export interface ScrapeResponse {
    requestURL?: string;
    responseData: Record<string, any>;
}

export interface ScrapePostTarget {
    getSourceValue(key: string): any;
    set(key: string, value: any): any;
    webscrapeData: any;
}

export type PostProcessor = (scrapedData: any, data: any, options: any) => any;
export type SkipFn = (post: any) => boolean;

const makeMetaObject = (item: any): any => {
    if (!item.url) {
        return item;
    }

    // Always strip any query params (maybe need to only do this for medium in future?)
    const newItem: any = {url: item.url.replace(/\?.*$/, '')};
    delete item.url;

    // If item already has a data property, use that directly to avoid double nesting
    if (item.data) {
        newItem.data = item.data;
    } else {
        newItem.data = item;
    }

    return newItem;
};

const findMatchIn = (existing: any[], match: any): any => {
    return existing.find(item => item.url === match.url);
};

const ScrapeError = ({url, code, originalError}: {url: string; code?: string; originalError?: Error}): any => {
    const error: any = new errors.InternalServerError({message: `Unable to scrape URL ${url}`});

    error.errorType = 'ScrapeError';
    error.scraper = 'Web';
    error.url = url;
    error.code = code;

    if (originalError) {
        error.originalError = originalError;
    }

    return error;
};

const sleep = async (ms: number): Promise<void> => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

export default class WebScraper {
    fileCache: FileCache;
    config: ScrapeConfig;
    postProcessor: PostProcessor;
    skipFn?: SkipFn;

    constructor(fileCache: FileCache, config: ScrapeConfig, postProcessor?: PostProcessor, skipFn?: SkipFn) {
        this.fileCache = fileCache;
        this.config = config;
        this.postProcessor = postProcessor || ((x: any) => x);
        this.skipFn = skipFn;
    }

    mergeRelations(existing: any[] | null, scraped: any[]): any[] {
        const result = existing || [];

        scraped.forEach((item) => {
            const newItem = makeMetaObject(item);
            const matchedItem = findMatchIn(result, newItem);

            // if we find a match, and the existing data isn't an array, copy data properties across
            /* c8 ignore next 4 -- defensive: only reachable if existing is a non-array object */
            if (matchedItem && !Array.isArray(result)) {
                for (const [key, datum] of Object.entries(newItem.data)) {
                    matchedItem.data[key] = datum;
                }
            } else {
                result.push(newItem);
            }
        });

        return result;
    }

    mergeObject(existing: any, scraped: any): any {
        const newItem = makeMetaObject(scraped);

        if (!existing) {
            return newItem;
        }

        for (const [key, datum] of Object.entries(newItem.data)) {
            existing.data[key] = datum;
        }

        return existing;
    }

    mergeResource(resource: any, scrapedData: any): any {
        for (const [key, value] of Object.entries(scrapedData)) {
            if (Array.isArray(value)) {
                resource[key] = this.mergeRelations(resource[key], value);
            } else if (typeof value === 'object' && value !== null) {
                resource[key] = this.mergeObject(resource[key], value);
            } else {
                resource[key] = value;
            }
        }

        return resource;
    }

    async scrape(url: string, config: Record<string, any>): Promise<ScrapeResponse> {
        try {
            const reqOpts = {
                url: url,
                timeout: 10000,
                headers: {
                    'user-agent': 'Crawler/1.0'
                }
            };
            const {data} = await scrapeIt(reqOpts, config);

            return {requestURL: url, responseData: data as Record<string, any>};
        } catch (error: any) {
            /* c8 ignore next 3 -- defensive: re-throw if already wrapped */
            if (error.errorType === 'ScrapeError') {
                throw error;
            }

            throw ScrapeError({url, code: error.code, originalError: error});
        }
    }

    async scrapeUrl(url: string, config: Record<string, any>, filename: string, scrapeWait: number | false = false): Promise<ScrapeResponse> {
        if (this.fileCache.hasFile(`${filename}.json`, 'tmp')) {
            return await this.fileCache.readTmpJSONFile(filename);
        }

        const response = await this.scrape(url, config);
        await this.fileCache.writeTmpFile(response, filename);

        response.responseData = omitEmpty(response.responseData) as Record<string, any>;

        if (scrapeWait) {
            await sleep(scrapeWait);
        }

        return response;
    }

    processScrapedData(scrapedData: any, data: any, options: any): void {
        scrapedData = this.postProcessor(scrapedData, data, options);
        this.mergeResource(data, scrapedData);
    }

    /**
     * Scrape metadata for a single post and set the results via post.set().
     * The post is duck-typed — it needs getSourceValue(key), set(key, value),
     * and a webscrapeData setter. Fields not in the post's schema are silently skipped.
     * The raw scraped response is stored on post.webscrapeData for later use.
     */
    async scrapePost(post: ScrapePostTarget, options: {wait_after_scrape?: number} = {}): Promise<void> {
        if (!this.config.posts) {
            return;
        }

        const url = post.getSourceValue('url');
        if (!url) {
            return;
        }

        const filename = slugify(url).slice(0, 250);
        const {responseData} = await this.scrapeUrl(url, this.config.posts, filename,
            options.wait_after_scrape || 100);

        if (!responseData) {
            return;
        }

        post.webscrapeData = responseData;

        const processed = this.postProcessor(responseData, null, options);
        for (const [key, value] of Object.entries(processed)) {
            if (value !== null && value !== undefined && value !== '') {
                try {
                    post.set(key, value);
                } catch {
                    // skip fields not in schema
                }
            }
        }
    }

    hydrate(ctx: any): any {
        let tasks: any[] = [];
        const res = ctx.result;

        // We only handle posts ATM, escape if there's nothing to do
        if (!this.config.posts || !res.posts || res.posts.length === 0) {
            return res;
        }

        tasks = res.posts.map((post: any) => {
            const {url, data} = post;
            let filename = slugify(url);
            filename = filename.substring(0, 250);

            return {
                title: url,
                skip: () => {
                    return this.skipFn ? this.skipFn(post) : false;
                },
                task: async (taskCtx: any) => {
                    try {
                        const {responseData} = await this.scrapeUrl(url, this.config.posts!, filename, taskCtx?.options?.wait_after_scrape || 100);
                        this.processScrapedData(responseData, data, taskCtx.options);
                    } catch (err) {
                        taskCtx.errors.push({message: `Error hydrating metadata for ${url}`, err});
                        throw err;
                    }
                }
            };
        });

        return tasks;
    }
}
