const _ = require('lodash');
const cheerio = require('cheerio');
const url = require('url');
const got = require('got');
const path = require('path');
const errors = require('@tryghost/errors');

// @TODO: expand this list
const htmlFields = ['html'];

const mobiledocFields = ['mobiledoc'];

// Duped from https://github.com/TryGhost/Ghost/blob/main/core/shared/config/overrides.json
const knownFileExtensions = ['.mp4','.webm', '.ogv', '.mp3', '.wav', '.ogg'];

const isHTMLField = field => _.includes(htmlFields, field);
const isMobiledocField = field => _.includes(mobiledocFields, field);
const isImageField = field => /image$/.test(field); // Match the keys for in Mobiledoc that end with x (i.e. featured_image)

const ScrapeError = ({src, code, statusCode, originalError}) => {
    let error = new errors.InternalServerError({message: `Unable to scrape URI ${src}`});

    error.errorType = 'ScrapeError';
    error.scraper = 'Media';
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

class MediaScraper {
    constructor(fileCache, defaultOptions) {
        this.fileCache = fileCache;
        this.defaultFileOptions = Object.assign({
            sizeLimit: false,
            report: {
                path: null,
                data: []
            }
        }, defaultOptions);

        this.sizeLimit = this.defaultFileOptions.sizeLimit;
        this.sizeLimitAsBytes = (this.defaultFileOptions.sizeLimit * 1048576);
        this.sizeReport = this.defaultFileOptions.report;
    }

    async fetchMedia(src) {
        // Timeout after 20 seconds
        return await got(src, {responseType: 'buffer', timeout: 20000});
    }

    async downloadMedia(src) {
        // Do not try parsing a URL when there is none
        if (!src) {
            return;
        }

        if (src.startsWith('//')){
            src = `https:${src}`;
        }

        // Do not try if file type is not supported,
        const srcExt = path.extname(src);
        if (!knownFileExtensions.includes(srcExt)) {
            return src;
        }

        let fileUrl = url.parse(src);
        let theFile = this.fileCache.resolveFileName(fileUrl.pathname, 'media');
        let fileOptions = Object.assign(theFile, this.defaultFileOptions);

        if (this.fileCache.hasFile(theFile.storagePath)) {
            return theFile.outputPath;
        }

        try {
            // Timeout after 20 seconds
            let response = await this.fetchMedia(src);

            const contentLength = response.headers && parseInt(response.headers['content-length']);

            if (this.sizeLimit && contentLength && contentLength > this.sizeLimitAsBytes) {
                this.sizeReport.data.push({
                    src: src,
                    bytesSize: contentLength
                });
                return src;
            } else {
                await this.fileCache.writeFile(response.body, fileOptions, 'media');
                return theFile.outputPath;
            }
        } catch (error) {
            throw ScrapeError({src, code: error.code, statusCode: error.statusCode, originalError: error});
        }
    }

    async processHTML(html) {
        let $ = cheerio.load(html);

        let audioSource = $('audio source').map(async (i, el) => {
            let src = $(el).attr('src');

            if (src && knownFileExtensions.includes(path.extname(src))) {
                let newSrc = await this.downloadMedia(src);
                $(el).attr('src', newSrc);
            }
        }).get();

        let audio = $('audio').map(async (i, el) => {
            let src = $(el).attr('src');

            if (src && knownFileExtensions.includes(path.extname(src))) {
                let newSrc = await this.downloadMedia(src);
                $(el).attr('src', newSrc);
            }
        }).get();

        let videoSource = $('video source').map(async (i, el) => {
            let src = $(el).attr('src');

            if (src && knownFileExtensions.includes(path.extname(src))) {
                let newSrc = await this.downloadMedia(src);
                $(el).attr('src', newSrc);
            }
        }).get();

        let video = $('video').map(async (i, el) => {
            let src = $(el).attr('src');

            if (src && knownFileExtensions.includes(path.extname(src))) {
                let newSrc = await this.downloadMedia(src);
                $(el).attr('src', newSrc);
            }
        }).get();

        let anchors = $('a').map(async (i, el) => {
            let href = $(el).attr('href');

            if (href && knownFileExtensions.includes(path.extname(href))) {
                let newSrc = await this.downloadMedia(href);
                $(el).attr('href', newSrc);
            }
        }).get();

        await Promise.all(audioSource, audio, videoSource, video, anchors);

        return $.html();
    }

    async processMobiledoc(value) {
        let json = JSON.parse(value);

        const MediaKeys = ['src']; // Such as <audio src=""> and <video src="">
        const markdownLinkRegex = /(?:\[(.*?)\]\((.*?)\))/gm;

        const processMobiledocMedia = async (object) => {
            for (let objectKey in object) {
                let objectValue = object[objectKey];
                if (typeof objectValue === 'object') {
                    await processMobiledocMedia(objectValue);
                } else {
                    if (MediaKeys.includes(objectKey)) {
                        let newSrc = await this.downloadMedia(objectValue);
                        object.src = newSrc;
                    } else if (object.markdown) {
                        object.markdown = await this.processHTML(object.markdown);
                        let matches = [...object.markdown.matchAll(markdownLinkRegex)];
                        matches.forEach(async (match) => {
                            let newSrc = await this.downloadMedia(match[2]);
                            object.markdown = object.markdown.replace(match[2], newSrc);
                        });
                    } else if (object.html) {
                        object.html = await this.processHTML(object.html);
                    } else if (object[0] === 'href') {
                        object[1] = await this.downloadMedia(object[1]);
                    }
                }
            }
        };

        let files = await processMobiledocMedia(json);

        await Promise.all([files]);

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
                                    resource[field] = await this.downloadMedia(value);
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

module.exports = MediaScraper;
