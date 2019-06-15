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

const ScrapeError = ({url, code, statusCode}) => {
    let error = new Error(`Unable to scrape URL ${url}`);

    error.errorType = 'ScrapeError';
    error.scraper = 'Web';
    error.url = url;
    error.code = code;
    if (statusCode) {
        error.statusCode = statusCode;
    }

    return error;
};

class WebScraper {
    constructor(fileCache, config, postProcessor) {
        this.fileCache = fileCache;
        this.config = config;
        this.postProcessor = postProcessor || _.identity;
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
            if (response.statusCode > 299) {
                throw ScrapeError({url, code: 'HTTPERROR', statusCode: response.statusCode});
            }

            return data;
        } catch (error) {
            if (error.errorType === 'ScrapeError') {
                throw error;
            }

            throw ScrapeError({url, code: error.code});
        }
    }

    async lookup(url, config) {
        // @TODO: replace this with a proper solution: i.e. Ghost's slugify, or xxhash, or similar
        var filename = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        if (this.fileCache.hasFile(filename, 'tmp')) {
            return await this.fileCache.readTmpJSONFile(filename);
        }

        let scrapedData = await this.scrape(url, config);
        scrapedData = omitEmpty(scrapedData);
        scrapedData = this.postProcessor(scrapedData);
        await this.fileCache.writeTmpJSONFile(scrapedData, filename);
        return scrapedData;
    }

    hydrate(ctx) {
        let tasks = [];
        let res = ctx.result;

        // We only handle posts ATM, escape if there's nothing to do
        if (!this.config.posts || !res.posts || res.posts.length === 0) {
            return res;
        }

        tasks = res.posts.map(({url, data}) => {
            return {
                title: url,
                task: async () => {
                    try {
                        let scrapedData = await this.lookup(url, this.config.posts);
                        this.mergeResource(data, scrapedData);
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
