import _ from 'lodash';
import scrapeIt from 'scrape-it';
import omitEmpty from 'omit-empty';
import errors from '@tryghost/errors';
import {slugify} from '@tryghost/string';

const makeMetaObject = (item) => {
    if (!item.url) {
        return item;
    }

    // Always strip any query params (maybe need to only do this for medium in future?)
    let newItem = {url: item.url.replace(/\?.*$/, '')};
    delete item.url;
    newItem.data = item;
    return newItem;
};

const findMatchIn = (existing, match) => {
    return _.find(existing, (item) => {
        return item.url === match.url;
    });
};

const ScrapeError = ({url, code, statusCode, originalError}) => {
    let error = new errors.InternalServerError({message: `Unable to scrape URL ${url}`});

    error.errorType = 'ScrapeError';
    error.scraper = 'Web';
    error.url = url;
    error.code = code;
    if (statusCode) {
        error.statusCode = statusCode;
    }

    if (originalError) {
        error.originalError = originalError;
    }

    return error;
};

// Literally sleep and wait for a set period of time
const sleep = async (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

class WebScraper {
    constructor(fileCache, config, postProcessor, skipFn) {
        this.fileCache = fileCache;
        this.config = config;
        this.postProcessor = postProcessor || _.identity;
        this.skipFn = skipFn;
    }

    mergeRelations(existing, scraped) {
        existing = existing || [];

        scraped.forEach((item) => {
            let newItem = makeMetaObject(item);
            let matchedItem = findMatchIn(existing, newItem);

            // if we find a match, copy data properties across
            if (matchedItem) {
                _.each(newItem.data, (datum, key) => {
                    matchedItem.data[key] = datum;
                });
            } else {
                existing.push(newItem);
            }
        });

        return existing;
    }

    mergeObject(existing, scraped) {
        let newItem = makeMetaObject(scraped);

        if (!existing) {
            return newItem;
        }

        _.each(newItem.data, (datum, key) => {
            existing.data[key] = datum;
        });

        return existing;
    }

    mergeResource(resource, scrapedData) {
        _.each(scrapedData, (value, key) => {
            if (_.isArray(value)) {
                resource[key] = this.mergeRelations(resource[key], value);
            } else if (_.isObject(value)) {
                resource[key] = this.mergeObject(resource[key], value);
            } else {
                resource[key] = value;
            }
        });

        return resource;
    }

    // Perform the scrape, and catch/report any errors
    async scrape(url, config) {
        try {
            const reqOpts = {
                url: url,
                timeout: 10000,
                headers: {
                    'user-agent': 'Crawler/1.0'
                }
            };
            let {data} = await scrapeIt(reqOpts, config);

            return {responseData: data};
        } catch (error) {
            if (error.errorType === 'ScrapeError') {
                throw error;
            }

            throw ScrapeError({url, code: error.code, originalError: error});
        }
    }

    async scrapeUrl(url, config, filename, scrapeWait = false) {
        if (this.fileCache.hasFile(`${filename}.json`, 'tmp')) {
            return await this.fileCache.readTmpJSONFile(filename);
        }

        let response = await this.scrape(url, config);
        await this.fileCache.writeTmpFile(response, filename);

        response.responseData = omitEmpty(response.responseData);

        if (scrapeWait) {
            await sleep(scrapeWait);
        }

        return response;
    }

    processScrapedData(scrapedData, data, options) {
        scrapedData = this.postProcessor(scrapedData, data, options);
        this.mergeResource(data, scrapedData);
    }

    // TODO: This is a temporary step while this gets a re-think
    get(ctx) {
        let tasks = [];
        let res = ctx.result;

        // We only handle posts ATM, escape if there's nothing to do
        if (!this.config.posts || !res.posts || res.posts.length === 0) {
            return res;
        }

        tasks = res.posts.map((post) => {
            let {url} = post;
            let filename = slugify(url);

            return {
                title: url,
                skip: () => {
                    return this.skipFn ? this.skipFn(post) : false;
                },
                task: async (ctx) => { // eslint-disable-line no-shadow
                    try {
                        let response = await this.scrapeUrl(url, this.config.posts, filename, ctx.options.wait_after_scrape);
                        let responseData = response.responseData || {};
                        post.metaData = {responseData};
                    } catch (err) {
                        ctx.logger.error({message: `Error fetching metadata ${url}`, err});
                        throw err;
                    }
                }
            };
        });

        return tasks;
    }

    // TODO: This is a temporary step while this gets a re-think
    apply(ctx) {
        let tasks = [];
        let res = ctx.result;

        // We only handle posts ATM, escape if there's nothing to do
        if (!this.config.posts || !res.posts || res.posts.length === 0) {
            return res;
        }

        tasks = res.posts.map((post) => {
            let {url, data} = post;

            return {
                title: url,
                skip: () => {
                    return this.skipFn ? this.skipFn(post) : false;
                },
                task: async (ctx) => { // eslint-disable-line no-shadow
                    try {
                        let {responseData} = post.metaData;

                        this.processScrapedData(responseData, data, ctx.options);
                    } catch (err) {
                        ctx.logger.error({message: `Error applying metadata for ${url}`, err});
                        throw err;
                    }
                }
            };
        });

        return tasks;
    }

    hydrate(ctx) {
        let tasks = [];
        let res = ctx.result;

        // We only handle posts ATM, escape if there's nothing to do
        if (!this.config.posts || !res.posts || res.posts.length === 0) {
            return res;
        }

        tasks = res.posts.map((post) => {
            let {url, data} = post;
            let filename = slugify(url);

            return {
                title: url,
                skip: () => {
                    return this.skipFn ? this.skipFn(post) : false;
                },
                task: async (ctx) => { // eslint-disable-line no-shadow
                    try {
                        let {responseData} = await this.scrapeUrl(url, this.config.posts, filename, ctx.options.wait_after_scrape);
                        this.processScrapedData(responseData, data, ctx.options);
                    } catch (err) {
                        ctx.logger.error({message: `Error hydrating metadata for ${url}`, err});
                        throw err;
                    }
                }
            };
        });

        return tasks;
    }
}

export default WebScraper;
