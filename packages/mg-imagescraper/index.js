const _ = require('lodash');
const cheerio = require('cheerio');
const url = require('url');
const got = require('got');

// @TODO: expand this list
const htmlFields = ['html'];

const isHTMLField = field => _.includes(htmlFields, field);
const isImageField = field => /image/.test(field);

class ImageScraper {
    constructor(fileCache) {
        this.fileCache = fileCache;
    }

    async downloadImage(src) {
        let imageUrl = url.parse(src);

        if (this.fileCache.hasFile(imageUrl.pathname, 'image')) {
            return imageUrl.pathname;
        }

        try {
            const response = await got(src);
            this.fileCache.writeImageFile(response.body, {filename: imageUrl.pathname});
        } catch (error) {
            console.error(error.response.body); /* eslint-disable-line no-console */
        }
    }

    async processHTML(html) {
        let $ = cheerio.load(html);
        let images = $('img');

        _.forEach(images, async (image) => {
            let src = $(image).attr('src') === undefined ? $(image).attr('data-src') : $(image).attr('src');
            // @TODO: replace old src with new src
            await this.downloadImage(src);
        });
    }

    async processField(field, value) {
        if (isImageField(field)) {
            // field has image in the name, value is null or a valid image URL
            // @TODO: fetch value & then update value
        } else if (isHTMLField(field)) {
            // field is an html field, we need to process the whole field looking for images
            await this.processHTML(value);
        }
    }

    async fetch(json) {
        // For each resource type e.g. posts, users
        _.forEach(json.data, (resources) => {
            // For each individual resource
            _.forEach(resources, (resource) => {
                // For each field
                _.forEach(resource, async (value, field) => {
                    return await this.processField(field, value);
                });
            });
        });

        return json;
    }
}

module.exports = ImageScraper;
