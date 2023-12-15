import {readFileSync} from 'node:fs';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import zipIngest from '@tryghost/mg-substack';
import {slugify} from '@tryghost/string';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';
import $ from 'cheerio';

const scrapeConfig = {
    posts: {
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
            attr: 'content'
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
            attr: 'content'
        },
        twitter_title: {
            selector: 'meta[name="twitter:title"]',
            attr: 'content'
        },
        twitter_description: {
            selector: 'meta[name="twitter:description"]',
            attr: 'content',
            convert: (x) => {
                return x.slice(0, 499);
            }
        },
        authors: {
            selector: 'script[type="application/ld+json"]',
            convert: (x) => {
                if (!x) {
                    return;
                }

                let ldJSON = JSON.parse(x);
                let theAuthors = [];

                if (ldJSON.author.length > 1) {
                    ldJSON.author.forEach((person) => {
                        theAuthors.push({
                            url: slugify(person.url),
                            data: {
                                name: person.name,
                                slug: slugify(person.name),
                                email: `${slugify(person.name)}@example.com`
                            }
                        });
                    });
                } else {
                    let author = (ldJSON.author[0]) ? ldJSON.author[0].name : ldJSON.author.name;

                    // Split string by ['and', '&', ','], trim white space from the resulting array items, and remove empty items
                    let authorSplit = author.split(/(?:,|and|&)+/).map(function (item) {
                        return item.trim();
                    }).filter(i => i);

                    authorSplit.forEach((item) => {
                        theAuthors.push({
                            url: slugify(item),
                            data: {
                                name: item,
                                slug: slugify(item),
                                email: `${slugify(item)}@example.com`
                            }
                        });
                    });
                }

                return theAuthors;
            }
        },
        tags: {
            selector: '.post-header > .post-label',
            how: 'html',
            convert: (x) => {
                if (!x) {
                    return;
                }

                let tags = [];

                const $tags = $.load(x, {
                    decodeEntities: false,
                    scriptingEnabled: false
                }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

                $tags('a').each((i, el) => {
                    const urlParts = $(el).attr('href').match(/.*\/s\/([a-zA-Z0-9-_]{1,})(\/.*)?/);

                    tags.push({
                        data: {
                            name: $(el).text(),
                            slug: urlParts[1]
                        }
                    });
                });

                return tags;
            }
        }
    }
};

const postProcessor = (scrapedData, data, options) => {
    if (options.useMetaAuthor && scrapedData.authors) {
        let usersArray = [];

        scrapedData.authors.forEach((user) => {
            usersArray.push({
                data: {
                    slug: user.data.slug,
                    name: `${user.data.name}`,
                    email: user.data.email
                }
            });
        });

        scrapedData.authors = usersArray;
    }

    if (scrapedData?.og_image?.includes('2Ftwitter%2Fsubscribe-card.jpg')) {
        scrapedData.og_image = '';
    }

    if (scrapedData?.twitter_image?.includes('2Ftwitter%2Fsubscribe-card.jpg')) {
        scrapedData.twitter_image = '';
    }

    if (scrapedData?.feature_image?.includes('2Ftwitter%2Fsubscribe-card.jpg')) {
        scrapedData.feature_image = '';
    }

    return scrapedData;
};

const skipScrape = (post) => {
    return post.data.status === 'draft';
};

/**
 * getTasks: Steps to Migrate from Medium
 *
 * Wiring of the steps to migrate from medium.
 *
 * @param {Object} options
 */
const getTaskRunner = (options, logger) => {
    let runnerTasks = [
        {
            title: 'Initializing',
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

                // Delete the authors meta field if the option is not enabled (this data is fetched regardless of options passed)
                if (!options.useMetaAuthor) {
                    delete scrapeConfig.posts.authors;
                }

                // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
                ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(options.pathToZip);
                ctx.fileCache = new fsUtils.FileCache(`substack-${ctx.options.cacheName}`, {
                    tmpPath: ctx.options.tmpPath
                });
                ctx.webScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor, skipScrape);
                ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                    sizeLimit: ctx.options.sizeLimit,
                    allowImages: ctx.allowScrape.images,
                    allowMedia: ctx.allowScrape.media,
                    allowFiles: ctx.allowScrape.files
                }, ctx);
                ctx.linkFixer = new MgLinkFixer();

                ctx.timings = {
                    readContent: false,
                    processContent: false,
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
            title: 'Read csv file',
            task: async (ctx) => {
                // 1. Read the csv file
                ctx.timings.readContent = Date.now();
                try {
                    ctx.result = await zipIngest.ingest(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'zip-export-mapped.json');
                } catch (error) {
                    ctx.logger.error({message: 'Failed to read CSV', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Read csv file',
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
                let tasks = ctx.webScraper.hydrate(ctx);

                let webScraperOptions = options;
                webScraperOptions.concurrent = 1;
                return makeTaskRunner(tasks, webScraperOptions);
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
            title: 'Process content',
            task: async (ctx) => {
                // 3. Pass the results through the processor to change the HTML structure
                ctx.timings.processContent = Date.now();
                try {
                    ctx.result = await zipIngest.process(ctx.result, ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'csv-export-data.json');
                } catch (error) {
                    ctx.logger.error({message: 'Failed to process content', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Process content',
                    duration: Date.now() - ctx.timings.processContent
                });
            }
        },
        {
            title: 'Build Link Map',
            task: async (ctx) => {
                // 4. Create a map of all known links for use later
                ctx.timings.buildLinkMap = Date.now();
                try {
                    ctx.linkFixer.buildMap(ctx);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to build link map', error});
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
                // 5. Format the data as a valid Ghost JSON file
                ctx.timings.formatDataAsGhost = Date.now();
                try {
                    ctx.result = toGhostJSON(ctx.result, ctx.options, ctx);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to format data as Ghost JSON', error});
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
                return [ctx.allowScrape.images, ctx.allowScrape.media, ctx.allowScrape.files].every(element => element === false);
            },
            task: async (ctx) => {
                // 6. Format the data as a valid Ghost JSON file
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
                return [ctx.allowScrape.images, ctx.allowScrape.media, ctx.allowScrape.files].every(element => element === false);
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
                // 7. Process the content looking for known links, and update them to new links
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
                // 8. Convert post HTML -> MobileDoc
                ctx.timings.htmlToMobiledoc = Date.now();
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx); // eslint-disable-line no-shadow
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to convert HTML to Mobiledoc', error});
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
                // 9. Write a valid Ghost import zip
                ctx.timings.writeJSON = Date.now();
                try {
                    await ctx.fileCache.writeGhostImportFile(ctx.result);
                    await ctx.fileCache.writeErrorJSONFile(ctx.errors);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to write Ghost import JSON file', error});
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
                // 10. Write a valid Ghost import zip
                ctx.timings.writeZip = Date.now();
                const isStorage = (options?.outputStorage && typeof options.outputStorage === 'object') ?? false;

                try {
                    let timer = Date.now();
                    const zipFinalPath = options.outputPath || process.cwd();
                    // zip the file and save it temporarily
                    ctx.outputFile = await fsUtils.zip.write(zipFinalPath, ctx.fileCache.zipDir, ctx.fileCache.defaultZipFileName);

                    if (isStorage) {
                        const storage = options.outputStorage;
                        const localFilePath = ctx.outputFile.path;

                        // read the file buffer
                        const fileBuffer = await readFileSync(ctx.outputFile.path);
                        // Upload the file to the storage
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-substack-${ctx.options.cacheName}.zip`});
                        // now that the file is uploaded to the storage, delete the local zip file
                        await fsUtils.zip.deleteFile(localFilePath);
                    }

                    task.output = `Successfully written zip to ${ctx.outputFile.path} in ${prettyMilliseconds(Date.now() - timer)}`;
                } catch (error) {
                    ctx.logger.error({message: 'Failed to write and upload ZIP file', error});
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
                    ctx.logger.error({message: 'Failed to clear cache', error});
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
