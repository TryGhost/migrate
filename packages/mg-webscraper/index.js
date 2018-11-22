const _ = require('lodash');
const scrapeIt = require('scrape-it');

const makeMetaObject = (item) => {
    if (!item.url) {
        return item;
    }

    // Always strip any query params (maybe need to only do this for medium in future?)
    let newItem = { url: item.url.replace(/\?.*$/, '') };
    delete item.url;
    newItem.data = item;
    return newItem;
};

const findMatchIn = (existing, match) => {
    return _.find(existing, (item) => {
        return item.url === match.url;
    });
};

class Scraper {
    constructor(config) {
        this.config = config;
    }

    mergeRelations(existing, scraped) {
        scraped.forEach(item => {
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

    mergeResource (resource) {
        return ({ data, response }) => {
            if (response.statusCode > 299) {
                return resource;
            }

            _.each(data, (value, key) => {
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
    }

    async hydrate(data) {
        let scrapeFns = [];

        // We only handle posts ATM, escape if there's nothing to do
        if (!this.config.posts || !data.posts || data.posts.length === 0) {
            return data;
        }

        scrapeFns = data.posts.map(({ url, data }) => {
            return scrapeIt(url, this.config.posts)
                .then(this.mergeResource(data))
                .catch((error) => {
                    // Catch any errors, and output the URL and the error
                    console.error('Webscraper unable to scrape', url);
                    console.error(error.stack);
                });
        });

        return Promise
            .all(scrapeFns)
            .then(() => {
                return data;
            })
            .catch((error) => {
                // @TODO: handle errors
                console.error('Webscraper request error', error.stack);
            });
    }
}

module.exports = Scraper;
