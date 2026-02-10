import wpAPI from '@tryghost/mg-wp-api';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {createGhostUserTasks} from '@tryghost/mg-ghost-authors';
import prettyMilliseconds from 'pretty-ms';

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
            attr: 'content',
            convert: (x) => {
                if (!x) {
                    return;
                }
                return x.slice(0, 499);
            }
        },
        og_image: {
            selector: 'meta[property="og:image"]',
            attr: 'content',
            convert: (x) => {
                return wpAPI.process.wpCDNToLocal(x);
            }
        },
        og_title: {
            selector: 'meta[property="og:title"]',
            attr: 'content'
        },
        og_description: {
            selector: 'meta[property="og:description"]',
            attr: 'content',
            convert: (x) => {
                if (!x) {
                    return;
                }
                return x.slice(0, 499);
            }
        },
        twitter_image: {
            selector: 'meta[name="twitter:image"], meta[name="twitter:image:src"]',
            attr: 'content',
            convert: (x) => {
                return wpAPI.process.wpCDNToLocal(x);
            }
        },
        twitter_title: {
            selector: 'meta[name="twitter:title"]',
            attr: 'content'
        },
        twitter_description: {
            selector: 'meta[name="twitter:description"]',
            attr: 'content',
            convert: (x) => {
                if (!x) {
                    return;
                }
                return x.slice(0, 499);
            }
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

const initialize = (options) => {
    return {
        title: 'Initializing Workspace',
        task: async (ctx, task) => {
            ctx.options = options;

            ctx.allowScrape = {
                all: ctx.options.scrape.includes('all'),
                assets: ctx.options.scrape.includes('all') || ctx.options.scrape.includes('assets') || ctx.options.scrape.includes('img') || ctx.options.scrape.includes('media') || ctx.options.scrape.includes('files'),
                web: ctx.options.scrape.includes('web') || ctx.options.scrape.includes('all')
            };

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.fileCache = new fsUtils.FileCache(options.url, {
                tmpPath: options.tmpPath,
                batchName: options.batch
            });
            ctx.wpScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor);
            ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                allowAllDomains: true
            }, ctx);
            await ctx.assetScraper.init();

            ctx.linkFixer = new MgLinkFixer();

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;

            if (options.batch > 0) {
                task.title += ` batch ${ctx.fileCache.batchName}`;
            }
        }
    };
};

const getInfoTaskList = (options) => {
    return [
        initialize(options),
        {
            title: 'Fetch Content Info from WP API',
            task: async (ctx) => {
                try {
                    ctx.info = await wpAPI.fetch.discover(options.url, ctx);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to fetch content from WP API', error});
                    throw error;
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
const getFullTaskList = (options) => {
    return [
        initialize(options),
        {
            title: 'Fetch Content from WP API',
            task: async (ctx) => {
                // 1. Read all content from the API
                try {
                    let tasks = await wpAPI.fetch.tasks(options.url, ctx);

                    if (options.batch !== 0) {
                        let batchIndex = options.batch - 1;
                        tasks = [tasks[batchIndex]];
                    }

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to fetch content from WP API', error});
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
                    ctx.errors.push({message: 'Failed to Process WP API JSON', error});
                    throw error;
                }
            }
        },
        ...createGhostUserTasks(options),
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
                    ctx.errors.push({message: 'Failed to build link map', error});
                    throw error;
                }
            }
        },
        {
            title: 'Format data as Ghost JSON',
            task: async (ctx) => {
                // 5. Format the data as a valid Ghost JSON file
                try {
                    ctx.result = await toGhostJSON(ctx.result, ctx.options, ctx);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to format data as Ghost JSON', error});
                    throw error;
                }
            }
        },
        {
            title: 'Fetch assets via AssetScraper',
            skip: ctx => !ctx.allowScrape.assets,
            task: async (ctx) => {
                // 6. Format the data as a valid Ghost JSON file
                let tasks = ctx.assetScraper.getTasks();
                return makeTaskRunner(tasks, {
                    verbose: options.verbose,
                    exitOnError: false,
                    concurrent: false
                });
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
                    return makeTaskRunner(tasks, {
                        verbose: options.verbose,
                        exitOnError: false,
                        concurrent: false
                    });
                } catch (error) {
                    ctx.errors.push({message: 'Failed to convert HTML -> MobileDoc', error});
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
                } catch (error) {
                    ctx.errors.push({message: 'Failed to write Ghost import JSON File', error});
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async (ctx, task) => {
                // 10. Write a valid Ghost import zip
                try {
                    let timer = Date.now();
                    ctx.outputFile = await fsUtils.zip.write(process.cwd(), ctx.fileCache.zipDir, ctx.fileCache.defaultZipFileName);
                    task.output = `Successfully written zip to ${ctx.outputFile.path} in ${prettyMilliseconds(Date.now() - timer)}`;
                } catch (error) {
                    ctx.errors.push({message: 'Failed to write Ghost import zip', error});
                    throw error;
                }
            }
        },
        {
            title: 'Clearing cached files',
            enabled: () => !options.cache && options.zip,
            task: async (ctx) => {
                // 11. Write a valid Ghost import zip
                try {
                    await ctx.fileCache.emptyCurrentCacheDir();
                } catch (error) {
                    ctx.errors.push({message: 'Failed to clear temporary cached files', error});
                    throw error;
                }
            }
        }
    ];
};

const getTaskRunner = (options) => {
    let tasks = [];

    if (options.info) {
        tasks = getInfoTaskList(options);
    } else {
        tasks = getFullTaskList(options);
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
