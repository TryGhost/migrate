import jekyllIngest from '@tryghost/mg-jekyll-export';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const scrapeConfig = {
    posts: {
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
        }
    }
};

const postProcessor = (scrapedData, data, options) => {
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

/**
 * getTasks: Steps to Migrate from Jekyll
 *
 * Wiring of the steps to migrate from Jekyll.
 *
 * @param {Object} options
 */
const getTaskRunner = (options) => {
    let runnerTasks = [
        {
            title: 'Initialising Workspace',
            task: async (ctx, task) => {
                ctx.options = options;
                ctx.allowScrape = {
                    all: ctx.options.scrape.includes('all'),
                    assets: ctx.options.scrape.includes('all') || ctx.options.scrape.includes('assets') || ctx.options.scrape.includes('img') || ctx.options.scrape.includes('media') || ctx.options.scrape.includes('files'),
                    web: ctx.options.scrape.includes('web') || ctx.options.scrape.includes('all')
                };

                // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
                ctx.fileCache = new fsUtils.FileCache(options.pathToZip);
                ctx.jekyllScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor);
                ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                    allowAllDomains: true
                }, ctx);
                await ctx.assetScraper.init();

                ctx.linkFixer = new MgLinkFixer();

                task.output = `Workspace initialised at ${ctx.fileCache.cacheDir}`;
            }
        },
        {
            title: 'Read Jekyll export zip',
            task: async (ctx) => {
                // 1. Read the zip file
                try {
                    ctx.result = jekyllIngest(options.pathToZip, options);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'jekyll-export-data.json');
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Fetch missing data via WebScraper',
            skip: ctx => !ctx.allowScrape.web,
            task: (ctx) => {
                // 2. Pass the results through the web scraper to get any missing data
                let tasks = ctx.jekyllScraper.hydrate(ctx); // eslint-disable-line no-shadow
                return makeTaskRunner(tasks, options);
            }
        },
        {
            title: 'Build Link Map',
            task: async (ctx) => {
                // 3. Create a map of all known links for use later
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
            task: async (ctx) => {
                // 4. Format the data as a valid Ghost JSON file
                try {
                    ctx.result = await toGhostJSON(ctx.result, ctx.options, ctx);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Fetch images via AssetScraper',
            skip: ctx => !ctx.allowScrape.assets,
            task: async (ctx) => {
                // 5. Format the data as a valid Ghost JSON file
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
                // 6. Process the content looking for known links, and update them to new links
                let tasks = ctx.linkFixer.fix(ctx, task); // eslint-disable-line no-shadow
                return makeTaskRunner(tasks, options);
            }
        },
        {
            // @TODO don't duplicate this with the utils json file
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 7. Convert post HTML -> MobileDoc
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx); // eslint-disable-line no-shadow
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import JSON File',
            task: async (ctx) => {
                // 8. Write a valid Ghost import zip
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
            task: async (ctx, task) => {
                // 9. Write a valid Ghost import zip
                try {
                    let timer = Date.now();
                    ctx.outputFile = await fsUtils.zip.write(process.cwd(), ctx.fileCache.zipDir, ctx.fileCache.defaultZipFileName);
                    task.output = `Successfully written zip to ${ctx.outputFile.path} in ${prettyMilliseconds(Date.now() - timer)}`;
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Clearing cached files',
            enabled: () => !options.cache && options.zip,
            task: async (ctx) => {
                try {
                    await ctx.fileCache.emptyCurrentCacheDir();
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        }
    ];

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(runnerTasks, Object.assign({topLevel: true}, options));
};

export default {
    getTaskRunner
};
