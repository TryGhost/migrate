const _ = require('lodash');
const cheerio = require('cheerio');
const url = require('url');
const got = require('got');
const path = require('path');
const errors = require('@tryghost/errors');

// @TODO: expand this list
const htmlFields = ['html'];

const mobiledocFields = ['mobiledoc'];

// @TODO: should probably be a shared list
const knownImageExtensions = ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz', '.ico', '.webp'];

const isHTMLField = field => _.includes(htmlFields, field);
const isMobiledocField = field => _.includes(mobiledocFields, field);
const isImageField = field => /image$/.test(field);

// @TODO: Also handle images in new media cards
// audio - thumbnailSrc
// video - thumbnailSrc
// video - customThumbnailSrc

const ScrapeError = ({src, code, statusCode, originalError}) => {
    let error = new errors.InternalServerError({message: `Unable to scrape URI ${src}`});

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
        // Case: Some servers don't play well when the UA string is blank or default UA string is used.
        // By defining a real-world the user-agent, we get more consistent results when requesting images.
        const chromeUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.109 Safari/537.36';
        return await got(src, {
            responseType: 'buffer',
            timeout: 20000,
            headers: {
                'user-agent': chromeUserAgent
            }
        });
    }

    async downloadImage(src) {
        // Do not try parsing a URL when there is none
        if (!src) {
            return;
        }

        if (src.startsWith('//')){
            src = `https:${src}`;
        }

        let imageUrl = url.parse(src);
        let imageFile = this.fileCache.resolveFileName(imageUrl.pathname, 'images');
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

                if (knownImageExtensions.includes(newExt)) {
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

        let links = $('a[href]').map(async (i, el) => {
            let $link = $(el);
            let href = $link.attr('href') || false;
            let hrefExt = (href) ? path.extname(href) : false;

            if (hrefExt && knownImageExtensions.includes(hrefExt)) {
                let newHref = await this.downloadImage(href);
                $link.attr('href', newHref);
            }
        }).get();

        let images = $('img').map(async (i, el) => {
            let $image = $(el);
            let type = $image.attr('src') === undefined ? 'data-src' : 'src';
            let src = $image.attr(type);
            let newSrc = await this.downloadImage(src);
            $image.attr(type, newSrc);
        }).get();

        let videoPosters = $('video').map(async (i, el) => {
            let $video = $(el);

            if (!$video.attr('poster')) {
                return;
            }

            let src = $video.attr('poster');
            let newSrc = await this.downloadImage(src);
            $video.attr('poster', newSrc);
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

        await Promise.all(links, images, videoPosters, bgImages);
        return $.html();
    }

    async processMobiledoc(value) {
        let json = JSON.parse(value);

        const imageKeys = ['src'];
        const markdownImageRegex = /(?:!\[(.*?)\]\((.*?)\))/gm;

        const processMobiledocImages = async (object) => {
            for (let objectKey in object) {
                let objectValue = object[objectKey];
                if (typeof objectValue === 'object') {
                    await processMobiledocImages(objectValue);
                } else {
                    if (imageKeys.includes(objectKey)) {
                        let newSrc = await this.downloadImage(objectValue);
                        object.src = newSrc;
                    } else if (object.markdown) {
                        object.markdown = await this.processHTML(object.markdown);
                        let matches = [...object.markdown.matchAll(markdownImageRegex)];
                        matches.forEach(async (match) => {
                            let newSrc = await this.downloadImage(match[2]);
                            object.markdown = object.markdown.replace(match[2], newSrc);
                        });
                    }
                }
            }
        };

        let images = await processMobiledocImages(json);

        await Promise.all([images]);

        return JSON.stringify(json);
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
                    tasks.push({
                        title: `${type}: ${resource.slug} ${field}`,
                        task: async () => {
                            try {
                                if (isImageField(field) && value) {
                                    resource[field] = await this.downloadImage(value);
                                } else if (isHTMLField(field) && value) {
                                    resource[field] = await this.processHTML(value);
                                } else if (isMobiledocField(field) && value) {
                                    resource[field] = await this.processMobiledoc(value);
                                }
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
                });
            });
        });

        return tasks;
    }
}

module.exports = ImageScraper;
