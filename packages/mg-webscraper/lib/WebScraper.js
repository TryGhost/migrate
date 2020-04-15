const _ = require('lodash');
const scrapeIt = require('scrape-it');
const omitEmpty = require('omit-empty');

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
    let error = new Error(`Unable to scrape URL ${url}`);

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
            let {data, response} = await scrapeIt(url, config);
            let {responseUrl, statusCode} = response;
            if (statusCode > 399) {
                throw ScrapeError({url, code: 'HTTPERROR', statusCode});
            }
            return {responseUrl, responseData: data};
        } catch (error) {
            if (error.errorType === 'ScrapeError') {
                throw error;
            }

            throw ScrapeError({url, code: error.code, originalError: error});
        }
    }

    async scrapeUrl(url, config, filename) {
        if (this.fileCache.hasFile(filename, 'tmp')) {
            return await this.fileCache.readTmpJSONFile(filename);
        }

        let response = await this.scrape(url, config);
        await this.fileCache.writeTmpJSONFile(response, filename);

        response.responseData = omitEmpty(response.responseData);

        return response;
    }

    processScrapedData(scrapedData, data) {
        scrapedData = this.postProcessor(scrapedData, data);
        this.mergeResource(data, scrapedData);
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
            // @TODO: replace this with a proper solution: i.e. Ghost's slugify, or xxhash, or similar
            let filename = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();

            return {
                title: url,
                skip: () => {
                    return this.skipFn ? this.skipFn(post) : false;
                },
                task: async (ctx, task) => {
                    try {
                        let {responseUrl, responseData} = await this.scrapeUrl(url, this.config.posts, filename);
                        this.processScrapedData(responseData, data);

                        if (responseUrl !== url) {
                            post.originalUrl = url;
                            post.url = responseUrl;
                            task.title = responseUrl;
                        }
                    } catch (error) {
                        ctx.errors.push(error);
                        throw error;
                    }
                }
            };
        });

        return tasks;
    }
}

module.exports = WebScraper;
