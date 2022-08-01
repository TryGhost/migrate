const wpAPI = require('@tryghost/mg-wp-api');
const mgJSON = require('@tryghost/mg-json');
const mgHtmlMobiledoc = require('@tryghost/mg-html-mobiledoc');
const MgWebScraper = require('@tryghost/mg-webscraper');
const MgImageScraper = require('@tryghost/mg-imagescraper');
const MgMediaScraper = require('@tryghost/mg-mediascraper');
const MgLinkFixer = require('@tryghost/mg-linkfixer');
const fsUtils = require('@tryghost/mg-fs-utils');
const makeTaskRunner = require('../lib/task-runner');

const scrapeConfig = {
    posts: {
        html: {
            selector: 'div.article-header__image',
            how: 'html',
            convert: (x) => {
                if (!x) {
                    return;
                }
                // we're fetching all inner html for custom used feature media,
                // such as iFrames or videos.
                return !x.match(/^(<img|<figure)/) && x;
            }
        },
        meta_title: {
            selector: 'title'
        },
        meta_description: {
            selector: 'meta[name="description"]',
            attr: 'content'
        },
        og_image: {
            selector: 'meta[property="og:image"]',
            attr: 'content'
        },
        og_title: {
            selector: 'meta[property="og:title"]',
            attr: 'content'
        },
        og_description: {
            selector: 'meta[property="og:description"]',
            attr: 'content'
        },
        twitter_image: {
            selector: 'meta[name="twitter:image"], meta[name="twitter:image:src"]',
            attr: 'content'
        },
        twitter_title: {
            selector: 'meta[name="twitter:title"]',
            attr: 'content'
        },
        twitter_description: {
            selector: 'meta[name="twitter:description"]',
            attr: 'content'
        },
        codeinjection_head: {
            selector: 'body > style',
            convert: (x) => {
                if (!x) {
                    return;
                }
                return `<style>${x}</style>`;
            }
        }
    }
};

const postProcessor = (scrapedData, data, options) => {
    if (scrapedData.html) {
        scrapedData.html = `<!--kg-card-begin: html-->${scrapedData.html}<!--kg-card-end: html-->${data.html}`;
    } else {
        delete scrapedData.html;
    }

    if (scrapedData.og_image) {
        scrapedData.og_image = scrapedData.og_image.replace(/(?:-\d{2,4}x\d{2,4})(.\w+)$/gi, '$1');
    }

    if (scrapedData.twitter_image) {
        scrapedData.twitter_image = scrapedData.twitter_image.replace(/(?:-\d{2,4}x\d{2,4})(.\w+)$/gi, '$1');
    }

    if (options.featureImage === 'og:image' && scrapedData.og_image) {
        data.feature_image = scrapedData.og_image;
    }

    return scrapedData;
};

module.exports.initialize = (url, options) => {
    return {
        title: 'Initializing Workspace',
        task: (ctx, task) => {
            ctx.options = options;

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.fileCache = new fsUtils.FileCache(url, {batchName: options.batch});
            ctx.wpScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor);
            ctx.imageScraper = new MgImageScraper(ctx.fileCache);

            ctx.sizeReports = {};
            ctx.mediaScraper = new MgMediaScraper(ctx.fileCache, {
                sizeLimit: ctx.options.size_limit || false
            });

            ctx.linkFixer = new MgLinkFixer();

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;

            ctx.allowScrape = {
                all: ctx.options.scrape.includes('all'),
                images: ctx.options.scrape.includes('img') || ctx.options.scrape.includes('all'),
                media: ctx.options.scrape.includes('media') || ctx.options.scrape.includes('all'),
                web: ctx.options.scrape.includes('web') || ctx.options.scrape.includes('all')
            };

            if (options.batch > 0) {
                task.title += ` batch ${ctx.fileCache.batchName}`;
            }
        }
    };
};

module.exports.getInfoTaskList = (url, options) => {
    return [
        this.initialize(url, options),
        {
            title: 'Fetch Content Info from WP API',
            task: async (ctx) => {
                try {
                    ctx.info = await wpAPI.fetch.discover(url, ctx);
                } catch (error) {
                    ctx.errors.push(error);
                }
            }
        }
    ];
};

/**
 * getFullTaskList: Full Steps to Migrate from WP
 *
 * Wiring of the steps to migrate from WP.
 *
 * @param {String} pathToZip
 * @param {Object} options
 */
module.exports.getFullTaskList = (url, options) => {
    return [
        this.initialize(url, options),
        {
            title: 'Fetch Content from WP API',
            task: async (ctx) => {
                // 1. Read all content from the API
                try {
                    let tasks = await wpAPI.fetch.tasks(url, ctx);

                    if (options.batch !== 0) {
                        let batchIndex = options.batch - 1;
                        tasks = [tasks[batchIndex]];
                    }

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Process WP API JSON',
            task: async (ctx) => {
                // 2. Convert WP API JSON into a format that the migrate tools understand
                try {
                    ctx.result = await wpAPI.process.all(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'wp-processed-data.json');
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Fetch missing metadata via WebScraper',
            skip: ctx => !ctx.allowScrape.web,
            task: (ctx) => {
                // 3. Pass the results through the web scraper to get any missing data
                let tasks = ctx.wpScraper.hydrate(ctx);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            title: 'Build Link Map',
            task: async (ctx) => {
                // 4. Create a map of all known links for use later
                try {
                    ctx.linkFixer.buildMap(ctx);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Format data as Ghost JSON',
            task: (ctx) => {
                // 5. Format the data as a valid Ghost JSON file
                try {
                    ctx.result = mgJSON.toGhostJSON(ctx.result, ctx.options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Fetch images via ImageScraper',
            skip: ctx => !ctx.allowScrape.images,
            task: async (ctx) => {
                // 6. Pass the JSON file through the image scraper
                let tasks = ctx.imageScraper.fetch(ctx);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            title: 'Fetch media via MediaScraper',
            skip: ctx => !ctx.allowScrape.media,
            task: async (ctx) => {
                // 7. Pass the JSON file through the file scraper
                let tasks = ctx.mediaScraper.fetch(ctx);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            title: 'Update links in content via LinkFixer',
            task: async (ctx, task) => {
                // 8. Process the content looking for known links, and update them to new links
                let tasks = ctx.linkFixer.fix(ctx, task);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            // @TODO don't duplicate this with the utils json file
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 9. Convert post HTML -> MobileDoc
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx);
                    let convertOptions = JSON.parse(JSON.stringify(options)); // Clone the options object
                    convertOptions.concurrent = false;
                    return makeTaskRunner(tasks, convertOptions);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import JSON File',
            task: async (ctx) => {
                // 10. Write a valid Ghost import zip
                try {
                    await ctx.fileCache.writeGhostImportFile(ctx.result);
                    await ctx.fileCache.writeErrorJSONFile(ctx.errors);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Report file sizes',
            skip: () => !options.size_limit,
            task: async (ctx) => {
                // 11. Report assets that were not downloaded
                try {
                    ctx.sizeReports.media = await ctx.fileCache.writeReportCSVFile(ctx.mediaScraper.sizeReport, {filename: 'media', sizeLimit: options.size_limit});
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async (ctx) => {
                // 12. Write a valid Ghost import zip
                try {
                    ctx.outputFile = fsUtils.zip.write(process.cwd(), ctx.fileCache.zipDir, ctx.fileCache.defaultZipFileName);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        }
    ];
};

module.exports.getTaskRunner = (url, options) => {
    let tasks = [];

    if (options.info) {
        tasks = this.getInfoTaskList(url, options);
    } else {
        tasks = this.getFullTaskList(url, options);
    }

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};
