import mediumIngest from '@tryghost/mg-medium-export';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {slugify} from '@tryghost/string';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const scrapeConfig = {
    posts: {
        author: {
            selector: '#root',
            data: {
                url: {
                    selector: 'a[href*="/@"]',
                    attr: 'href',
                    eq: 1,
                    convert: (x) => {
                        if (x.match(/(\/@.*?)\?/)) {
                            return `https://medium.com${x.match(/(\/@.*?)\?/)[1]}`;
                        }
                        return x;
                    }
                },
                profile_image: {
                    selector: 'a[href*="/@"] img',
                    eq: 1,
                    attr: 'src'
                }
            }
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
            selector: 'meta[name="twitter:image:src"]',
            attr: 'content'
        },
        twitter_title: {
            selector: 'meta[property="twitter:title"]',
            attr: 'content'
        },
        twitter_description: {
            selector: 'meta[property="twitter:description"]',
            attr: 'content'
        },
        tags: {
            listItem: 'ul > li > a[href*="/tagged/"]',
            name: 'tags',
            data: {
                name: {
                    convert: (x) => {
                        return x;
                    }
                },
                url: {
                    convert: (x) => {
                        return slugify(x);
                    }
                }
            }
        }
    }
};

const postProcessor = (scrapedData) => {
    if (scrapedData.status === 'Unlisted') {
        scrapedData.status = 'draft';
        scrapedData.tags = scrapedData.tags || [];
        scrapedData.tags.push({url: 'migrator-added-tag', name: '#Unlisted'});
    }

    return scrapedData;
};

/**
 * getTasks: Steps to Migrate from Medium
 *
 * Wiring of the steps to migrate from medium.
 *
 * @param {String} pathToZip
 * @param {Object} options
 */
const getTaskRunner = (pathToZip, options, logger) => {
    let runnerTasks = [
        {
            title: 'Initializing Workspace',
            task: (ctx, task) => {
                ctx.options = options;
                ctx.logger = logger;
                ctx.allowScrape = {
                    all: ctx.options.scrape.includes('all'),
                    images: ctx.options.scrape.includes('img') || ctx.options.scrape.includes('all'),
                    media: ctx.options.scrape.includes('media') || ctx.options.scrape.includes('all'),
                    files: ctx.options.scrape.includes('files') || ctx.options.scrape.includes('all'),
                    web: ctx.options.scrape.includes('web') || ctx.options.scrape.includes('all')
                };

                // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
                ctx.fileCache = new fsUtils.FileCache(pathToZip);
                ctx.mediumScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor);
                ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                    sizeLimit: ctx.options.sizeLimit,
                    allowImages: ctx.allowScrape.images,
                    allowMedia: ctx.allowScrape.media,
                    allowFiles: ctx.allowScrape.files
                }, ctx);
                ctx.linkFixer = new MgLinkFixer();

                ctx.timings = {
                    readContent: false,
                    webScraper: false,
                    buildLinkMap: false,
                    formatDataAsGhost: false,
                    assetScraper: false,
                    linkFixer: false,
                    htmlToMobiledoc: false,
                    writeJSON: false,
                    writeZip: false,
                    clearCache: false
                };

                task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
            }
        },
        {
            title: 'Read Medium export zip',
            task: async (ctx) => {
                // 1. Read the zip file
                ctx.timings.readContent = Date.now();
                try {
                    ctx.result = mediumIngest(pathToZip, options);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'medium-export-data.json');
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Read Medium export zip',
                    duration: Date.now() - ctx.timings.readContent
                });
            }
        },
        {
            title: 'Fetch missing data via WebScraper',
            skip: ctx => !ctx.allowScrape.web,
            task: (ctx) => {
                // 2. Pass the results through the web scraper to get any missing data
                ctx.timings.webScraper = Date.now();
                let tasks = ctx.mediumScraper.hydrate(ctx); // eslint-disable-line no-shadow
                return makeTaskRunner(tasks, options);
            }
        },
        {
            skip: ctx => !ctx.allowScrape.web,
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Fetch missing data via WebScraper',
                    duration: Date.now() - ctx.timings.webScraper
                });
            }
        },
        {
            title: 'Build Link Map',
            task: async (ctx) => {
                // 3. Create a map of all known links for use later
                ctx.timings.buildLinkMap = Date.now();
                try {
                    ctx.linkFixer.buildMap(ctx);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Build Link Map',
                    duration: Date.now() - ctx.timings.buildLinkMap
                });
            }
        },
        {
            title: 'Format data as Ghost JSON',
            task: (ctx) => {
                // 4. Format the data as a valid Ghost JSON file
                ctx.timings.formatDataAsGhost = Date.now();
                try {
                    ctx.result = toGhostJSON(ctx.result, ctx.options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Format data as Ghost JSON',
                    duration: Date.now() - ctx.timings.formatDataAsGhost
                });
            }
        },
        {
            title: 'Fetch images via AssetScraper',
            skip: (ctx) => {
                return ![ctx.allowScrape.images, ctx.allowScrape.media, ctx.allowScrape.files].some(() => true);
            },
            task: async (ctx) => {
                // 5. Format the data as a valid Ghost JSON file
                ctx.timings.assetScraper = Date.now();
                let tasks = ctx.assetScraper.fetch(ctx);
                return makeTaskRunner(tasks, {
                    verbose: options.verbose,
                    exitOnError: false,
                    concurrent: false
                });
            }
        },
        {
            skip: (ctx) => {
                return ![ctx.allowScrape.images, ctx.allowScrape.media, ctx.allowScrape.files].some(() => true);
            },
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Fetch images via AssetScraper',
                    duration: Date.now() - ctx.timings.assetScraper
                });
            }
        },
        {
            title: 'Update links in content via LinkFixer',
            task: async (ctx, task) => {
                // 6. Process the content looking for known links, and update them to new links
                ctx.timings.linkFixer = Date.now();
                let tasks = ctx.linkFixer.fix(ctx, task); // eslint-disable-line no-shadow
                return makeTaskRunner(tasks, options);
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Update links in content via LinkFixer',
                    duration: Date.now() - ctx.timings.linkFixer
                });
            }
        },
        {
            // @TODO don't duplicate this with the utils json file
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 7. Convert post HTML -> MobileDoc
                ctx.timings.htmlToMobiledoc = Date.now();
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
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Convert HTML -> MobileDoc',
                    duration: Date.now() - ctx.timings.htmlToMobiledoc
                });
            }
        },
        {
            title: 'Write Ghost import JSON File',
            task: async (ctx) => {
                // 8. Write a valid Ghost import zip
                ctx.timings.writeJSON = Date.now();
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
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Write Ghost import JSON File',
                    duration: Date.now() - ctx.timings.writeJSON
                });
            }
        },
        {
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async (ctx, task) => {
                // 9. Write a valid Ghost import zip
                ctx.timings.writeZip = Date.now();
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
            skip: () => !options.zip,
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Write Ghost import zip',
                    duration: Date.now() - ctx.timings.writeZip
                });
            }
        },
        {
            title: 'Clearing cached files',
            enabled: () => !options.cache && options.zip,
            task: async (ctx) => {
                ctx.timings.clearCache = Date.now();
                try {
                    await ctx.fileCache.emptyCurrentCacheDir();
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            enabled: () => !options.cache && options.zip,
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Clearing cached files',
                    duration: Date.now() - ctx.timings.clearCache
                });
            }
        }
    ];

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(runnerTasks, Object.assign({topLevel: true}, options));
};

export default {
    getTaskRunner
};
