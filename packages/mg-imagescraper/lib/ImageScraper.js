const _ = require('lodash');
const cheerio = require('cheerio');
const url = require('url');
const got = require('got');
const path = require('path');

// @TODO: expand this list
const htmlFields = ['html'];

// @TODO: should probably be a shared list
const knownExtensions = ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz', '.ico'];

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
    if (originalError.body) {
        // We really don't need the buffer for our error file
        delete originalError.body;
    }
    error.originalError = originalError;

    return error;
};

class ImageScraper {
    constructor(fileCache, defaultOptions) {
        this.fileCache = fileCache;
        this.defaultImageOptions = Object.assign({
            optimize: true
        }, defaultOptions);
    }

    changeExtension(string, ext) {
        return path.join(path.dirname(string), path.basename(string, path.extname(string)) + ext);
    }

    async fetchImage(src) {
        // Timeout after 20 seconds
        return await got(src, {responseType: 'buffer', timeout: 20000});
    }

    async downloadImage(src) {
        // Do not try parsing a URL when there is none
        if (!src) {
            return;
        }
        let imageUrl = url.parse(src);
        let imageFile = this.fileCache.resolveImageFileName(imageUrl.pathname);
        let imageOptions = Object.assign(imageFile, this.defaultImageOptions);

        if (this.fileCache.hasFile(imageFile.storagePath)) {
            return imageFile.outputPath;
        }

        try {
            // Timeout after 20 seconds
            let response = await this.fetchImage(src);

            // Get the file extension from `src`
            // Will return then last `.` with anything after if, eg `.`, `.png`
            let extension = path.extname(src);

            // If we have an extension of 2 or less characters
            if (extension.length <= 2) {
                // Get the content type from response headers and convert to extension
                let contentTypeParts = response.headers['content-type'].split('/');
                let newExt = '.' + contentTypeParts[1];

                if (knownExtensions.includes(newExt)) {
                    imageOptions.filename = this.changeExtension(imageOptions.filename, newExt);
                    imageOptions.storagePath = this.changeExtension(imageOptions.storagePath, newExt);
                    imageOptions.outputPath = this.changeExtension(imageOptions.outputPath, newExt);
                }
            }

            await this.fileCache.writeImageFile(response.body, imageOptions);
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
                                    error.resource = {
                                        title: resource.title,
                                        slug: resource.slug
                                    };
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
                                    error.resource = {
                                        title: resource.title,
                                        slug: resource.slug
                                    };
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
