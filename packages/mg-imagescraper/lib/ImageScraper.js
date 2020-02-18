const _ = require('lodash');
const cheerio = require('cheerio');
const url = require('url');
const got = require('got');

// @TODO: expand this list
const htmlFields = ['html'];

const isHTMLField = field => _.includes(htmlFields, field);
const isImageField = field => /image/.test(field);

const ScrapeError = ({src, code, statusCode, originalError}) => {
    let error = new Error(`Unable to scrape URI ${src}`);

    error.errorType = 'ScrapeError';
    error.scraper = 'Image';
    error.src = src;
    error.code = code;
    if (statusCode) {
        error.statusCode = statusCode;
    }
    error.originalError = originalError;

    return error;
};

class ImageScraper {
    constructor(fileCache) {
        this.fileCache = fileCache;
    }

    async downloadImage(src) {
        // Do not try parsing a URL when there is none
        if (!src) {
            return;
        }
        let imageUrl = url.parse(src);
        let imageFile = this.fileCache.resolveImageFileName(imageUrl.pathname);

        if (this.fileCache.hasFile(imageFile.storagePath)) {
            return imageFile.outputPath;
        }

        try {
            // Got 9 requires encoding: null, Got 10 requires responseType: 'buffer'
            // @TODO: fix this when we can upgrade Got to 10 again (e.g. support Node 10 only)
            let response = await got(src, {encoding: null, responseType: 'buffer'});
            await this.fileCache.writeImageFile(response.body, imageFile);
            return imageFile.outputPath;
        } catch (error) {
            throw ScrapeError({src, code: error.code, statusCode: error.statusCode, originalError: error});
        }
    }

    async processHTML(html) {
        let $ = cheerio.load(html);

        let images = $('img').map(async (i, el) => {
            let $image = $(el);
            let type = $image.attr('src') === undefined ? 'data-src' : 'src';
            let src = $image.attr(type);
            let newSrc = await this.downloadImage(src);
            $image.attr(type, newSrc);
        }).get();

        let bgImages = $('[style*="background-image"]').map(async (i, el) => {
            let $image = $(el);
            let match = $image.css('background-image').match(/url\(([^)]*?)\)/);
            // @TODO: figure out error handling here, so we can at least get info about broken cases
            if (match) {
                let src = match[1];
                let newSrc = await this.downloadImage(src);
                $image.css('background-image', `url(${newSrc})`);
            }
        }).get();

        await Promise.all(images, bgImages);
        return $.html();
    }

    async processField(field, value) {
        if (isImageField(field)) {
            // field has image in the name, value is null or a valid image URL
            // @TODO: fetch value & then update value
            return value;
        } else if (isHTMLField(field)) {
            // field is an html field, we need to process the whole field looking for images
            return await this.processHTML(value);
        }

        return value;
    }

    fetch(ctx) {
        let tasks = [];
        let json = ctx.result;

        // For each resource type e.g. posts, users
        _.forEach(json.data, (resources, type) => {
            // For each individual resource
            _.forEach(resources, (resource) => {
                // For each field
                _.forEach(resource, (value, field) => {
                    // @TODO: rework this code!
                    if (isImageField(field) && value) {
                        tasks.push({
                            title: `${type}: ${resource.slug} ${field}`,
                            task: async () => {
                                try {
                                    resource[field] = await this.downloadImage(value);
                                } catch (error) {
                                    error.resource = resource;
                                    ctx.errors.push(error);
                                    throw error;
                                }
                            }
                        });
                    } else if (isHTMLField(field) && value) {
                        tasks.push({
                            title: `${type}: ${resource.slug} ${field}`,
                            task: async () => {
                                try {
                                    resource[field] = await this.processHTML(value);
                                } catch (error) {
                                    ctx.errors.push(error);
                                    throw error;
                                }
                            }
                        });
                    }
                });
            });
        });

        return tasks;
    }
}

module.exports = ImageScraper;
