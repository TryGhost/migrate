const _ = require('lodash');
const cheerio = require('cheerio');
const url = require('url');
const axios = require('axios');
const imageType = require('image-type');
const isSvg = require('is-svg');
const path = require('path');
const errors = require('@tryghost/errors');

// @TODO: expand this list
const htmlFields = ['html'];

const mobiledocFields = ['mobiledoc'];

// Taken from https://github.com/TryGhost/Ghost/blob/main/ghost/core/core/shared/config/overrides.json
const knownImageExtensions = ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz', '.ico', '.webp'];
const knownImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/webp'];

const isHTMLField = field => _.includes(htmlFields, field);
const isMobiledocField = field => _.includes(mobiledocFields, field);
const isImageField = field => /image$/.test(field);

// @TODO: Also handle images in new media cards
// audio - thumbnailSrc
// video - thumbnailSrc
// video - customThumbnailSrc

const ScrapeError = ({src, code, statusCode, originalError = {}, note}) => {
    let error = new errors.InternalServerError({message: `Unable to scrape URI ${src}`});

    error.errorType = 'ScrapeError';
    error.scraper = 'Image';
    error.src = src;
    error.code = code;
    if (statusCode) {
        error.statusCode = statusCode;
    }
    if (note) {
        error.note = note;
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

    getImageDataFromBuffer(buffer) {
        const imageTypeData = imageType(buffer);
        return imageTypeData;
    }

    changeExtension(string, ext) {
        return path.join(path.dirname(string), path.basename(string, path.extname(string)) + '.' + ext);
    }

    async fetchImage(src, ctx) {
        try {
            const response = await axios.get(encodeURI(src), {
                responseType: 'arraybuffer',
                timeout: 2000,
                validateStatus: (status) => {
                    return status >= 200 && status <= 400; // default
                }
            });

            return response;
        } catch (error) {
            let fetchError = ScrapeError({src, code: error.code, statusCode: error.statusCode, originalError: error, note: 'Catch-all error'});
            ctx.errors.push(fetchError);
        }
    }

    async downloadImage(src, ctx = {}) {
        // Do not try parsing a URL when there is none
        if (!src) {
            return;
        }

        if (src.startsWith('//')){
            src = `https:${src}`;
        }

        let imageUrl = url.parse(src);
        let imageFile = this.fileCache.resolveFileName(imageUrl.pathname, 'images');

        // CASE: We infer file extension based on the mime type, which always returns 'jpg' for 'image/jpeg',
        // and saves files with this extension. So, we must change the extension here to check if a file exists.
        imageFile.filename = imageFile.filename.replace('.jpeg', '.jpg');
        imageFile.storagePath = imageFile.storagePath.replace('.jpeg', '.jpg');
        imageFile.outputPath = imageFile.outputPath.replace('.jpeg', '.jpg');

        let imageOptions = Object.assign(imageFile, this.defaultImageOptions);

        if (this.fileCache.hasFile(imageFile.storagePath)) {
            return imageFile.outputPath;
        }

        try {
            // Timeout after 20 seconds
            let response = await this.fetchImage(src, ctx);

            // Return original remote src if no response
            if (!response) {
                return src;
            }

            const isImageSvg = isSvg(response.data);

            // Get file type from image buffer
            const imageData = this.getImageDataFromBuffer(response.data);

            if (isImageSvg) {
                imageOptions.filename = this.changeExtension(imageOptions.filename, 'svg');
                imageOptions.storagePath = this.changeExtension(imageOptions.storagePath, 'svg');
                imageOptions.outputPath = this.changeExtension(imageOptions.outputPath, 'svg');
            } else if (imageData) {
                const imageExtension = imageData.ext || false;
                const imageMime = imageData.mime || false;
                if (knownImageTypes.includes(imageMime)) {
                    imageOptions.filename = this.changeExtension(imageOptions.filename, imageExtension);
                    imageOptions.storagePath = this.changeExtension(imageOptions.storagePath, imageExtension);
                    imageOptions.outputPath = this.changeExtension(imageOptions.outputPath, imageExtension);
                } else {
                    let fetchError = ScrapeError({src, code: `Unsupported image type (${imageExtension} / ${imageMime} / ${src})`, statusCode: 415});
                    ctx.errors.push(fetchError);
                    return false;
                }
            } else {
                let fetchError = ScrapeError({src, code: `Unsupported image type (${src})`, statusCode: 415});
                ctx.errors.push(fetchError);
                return false;
            }

            await this.fileCache.writeImageFile(response.data, imageOptions);
            return imageFile.outputPath;
        } catch (error) {
            throw ScrapeError({src, code: error.code, statusCode: error.statusCode, originalError: error, note: 'Error saving image'});
        }
    }

    async processHTML(html, ctx) {
        let $ = cheerio.load(html);

        let links = $('a[href]').map(async (i, el) => {
            let $link = $(el);
            let href = $link.attr('href') || false;
            let hrefExt = (href) ? path.extname(href) : false;

            if (hrefExt && knownImageExtensions.includes(hrefExt)) {
                let newHref = await this.downloadImage(href, ctx);
                $link.attr('href', newHref);
            }
        }).get();

        let images = $('img').map(async (i, el) => {
            let $image = $(el);
            let type = $image.attr('src') === undefined ? 'data-src' : 'src';
            let src = $image.attr(type);
            let newSrc = await this.downloadImage(src, ctx);
            $image.attr(type, newSrc);
        }).get();

        let videoPosters = $('video').map(async (i, el) => {
            let $video = $(el);

            if (!$video.attr('poster')) {
                return;
            }

            let src = $video.attr('poster');
            let newSrc = await this.downloadImage(src, ctx);
            $video.attr('poster', newSrc);
        }).get();

        let bgImages = $('[style*="background-image"]').map(async (i, el) => {
            let $image = $(el);
            let match = $image.css('background-image').match(/url\(([^)]*?)\)/);
            // @TODO: figure out error handling here, so we can at least get info about broken cases
            if (match) {
                let src = match[1];
                let newSrc = await this.downloadImage(src, ctx);
                $image.css('background-image', `url(${newSrc})`);
            }
        }).get();

        await Promise.all(links, images, videoPosters, bgImages);
        return $.html();
    }

    async processMobiledoc(value, ctx) {
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
                        let newSrc = await this.downloadImage(objectValue, ctx);
                        object.src = newSrc;
                    } else if (object.markdown) {
                        object.markdown = await this.processHTML(object.markdown, ctx);
                        let matches = [...object.markdown.matchAll(markdownImageRegex)];
                        matches.forEach(async (match) => {
                            let newSrc = await this.downloadImage(match[2], ctx);
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
                    if (!['posts_tags', 'posts_authors'].includes(type)) { // 'posts_tags' & 'posts_authors' never contain any images
                        tasks.push({
                            title: `Images for ${type}: ${resource.slug} ${field}`,
                            task: async () => {
                                try {
                                    if (isImageField(field) && value) {
                                        resource[field] = await this.downloadImage(value, ctx);
                                    } else if (isHTMLField(field) && value) {
                                        resource[field] = await this.processHTML(value, ctx);
                                    } else if (isMobiledocField(field) && value) {
                                        resource[field] = await this.processMobiledoc(value, ctx);
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
                    }
                });
            });
        });

        return tasks;
    }
}

module.exports = ImageScraper;
