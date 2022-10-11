import wpAPI from '@tryghost/mg-wp-api';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import makeTaskRunner from '../lib/task-runner.js';

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
        scrapedData.feature_image = scrapedData.og_image;
    }

    return scrapedData;
};

const initialize = (url, options) => {
    return {
        title: 'Initializing Workspace',
        task: (ctx, task) => {
            ctx.options = options;
            ctx.allowScrape = {
                all: ctx.options.scrape.includes('all'),
                images: ctx.options.scrape.includes('img') || ctx.options.scrape.includes('all'),
                media: ctx.options.scrape.includes('media') || ctx.options.scrape.includes('all'),
                files: ctx.options.scrape.includes('files') || ctx.options.scrape.includes('all'),
                web: ctx.options.scrape.includes('web') || ctx.options.scrape.includes('all')
            };

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.fileCache = new fsUtils.FileCache(url, {batchName: options.batch});
            ctx.wpScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor);
            ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                sizeLimit: ctx.options.sizeLimit,
                allowImages: ctx.allowScrape.images,
                allowMedia: ctx.allowScrape.media,
                allowFiles: ctx.allowScrape.files
            });
            ctx.linkFixer = new MgLinkFixer();

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;

            if (options.batch > 0) {
                task.title += ` batch ${ctx.fileCache.batchName}`;
            }
        }
    };
};

const getInfoTaskList = (url, options) => {
    return [
        initialize(url, options),
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
const getFullTaskList = (url, options) => {
    return [
        initialize(url, options),
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
                    ctx.result = toGhostJSON(ctx.result, ctx.options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Fetch images via AssetScraper',
            skip: (ctx) => {
                return [ctx.allowScrape.images, ctx.allowScrape.media, ctx.allowScrape.files].every(element => element === false);
            },
            task: async (ctx) => {
                // 6. Format the data as a valid Ghost JSON file
                let tasks = ctx.assetScraper.fetch(ctx);
                let assetScraperOptions = JSON.parse(JSON.stringify(options)); // Clone the options object
                assetScraperOptions.concurrent = false;
                return makeTaskRunner(tasks, assetScraperOptions);
            }
        },
        {
            title: 'Update links in content via LinkFixer',
            task: async (ctx, task) => {
                // 7. Process the content looking for known links, and update them to new links
                let tasks = ctx.linkFixer.fix(ctx, task);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            // @TODO don't duplicate this with the utils json file
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 8. Convert post HTML -> MobileDoc
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
                // 9. Write a valid Ghost import zip
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
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async (ctx) => {
                // 10. Write a valid Ghost import zip
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

const getTaskRunner = (url, options) => {
    let tasks = [];

    if (options.info) {
        tasks = getInfoTaskList(url, options);
    } else {
        tasks = getFullTaskList(url, options);
    }

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};

export default {
    initialize,
    getInfoTaskList,
    getFullTaskList,
    getTaskRunner
};
