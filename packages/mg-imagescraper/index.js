const _ = require('lodash');
const cheerio = require('cheerio');
const url = require('url');
const got = require('got');

// @TODO: get rid of this!
const path = require('path');

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
        // @TODO: don't hardcode the image path here!
        let finalPath = path.join('/', 'content', 'images', imageUrl.pathname);


        if (this.fileCache.hasFile(imageUrl.pathname, 'image')) {
            return finalPath;
        }

        try {
            const response = await got(src);
            this.fileCache.writeImageFile(response.body, {filename: imageUrl.pathname});
            return finalPath;
        } catch (error) {
            console.error(error.response.body); /* eslint-disable-line no-console */
        }
    }

    async processHTML(html) {
        let $ = cheerio.load(html);

        const promises = $('img').map(async (i, el) => {
            let $image = $(el);
            let type = $image.attr('src') === undefined ? 'data-src' : 'src';
            let newSrc = await this.downloadImage($image.attr(type));
            $image.attr(type, newSrc);
        }).get();

        await Promise.all(promises);
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

    async fetch(json) {
        let promises = [];

        // For each resource type e.g. posts, users
        _.forEach(json.data, (resources) => {
            // For each individual resource
            _.forEach(resources, (resource) => {
                // For each field
                _.forEach(resource, (value, field) => {
                    promises.push((async () => {
                        resource[field] = await this.processField(field, value);
                    })());
                });
            });
        });

        await Promise.all(promises);
        return json;
    }
}

module.exports = ImageScraper;
