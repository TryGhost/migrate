import {readFileSync} from 'node:fs';
import beehiivIngest from '@tryghost/mg-beehiiv';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';
import {slugify} from '@tryghost/string';

const scrapeConfig = {
    posts: {
        meta_description: {
            selector: 'meta[name="description"]',
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
        twitter_title: {
            selector: 'meta[property="twitter:title"]',
            attr: 'content'
        },
        twitter_description: {
            selector: 'meta[property="twitter:description"]',
            attr: 'content'
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

                    return theAuthors;
                } else if ((ldJSON.author[0]) ? ldJSON.author[0].name : ldJSON.author.name) {
                    let author = (ldJSON.author[0]) ? ldJSON.author[0].name : ldJSON.author.name;

                    // Split string by ['and', '&', ','], trim white space from the resulting array items, and remove empty items
                    let authorSplit = author.split(/(?:,|and|&)+/).map(function (item) {
                        return item.trim();
                    }).filter(i => i);

                    authorSplit.forEach((item) => {
                        theAuthors.push({
                            data: {
                                name: item,
                                slug: slugify(item),
                                email: `${slugify(item)}@example.com`
                            }
                        });
                    });

                    return theAuthors;
                } else {
                    return;
                }
            }
        }
    }
};

const postProcessor = (scrapedData, data, options) => { // eslint-disable-line no-unused-vars
    if (!scrapedData.authors || scrapedData.authors.length === 0) {
        const defaultAuthorName = options.default_author_name;
        const defaultAuthorSlug = slugify(defaultAuthorName);
        const defaultAuthorEmail = `${defaultAuthorSlug}@example.com`;

        scrapedData.authors = [{
            data: {
                slug: defaultAuthorSlug,
                name: defaultAuthorName,
                email: defaultAuthorEmail
            }
        }];
    }

    return scrapedData;
};

const skipScrape = (post) => {
    return post.data.status === 'draft' || post.url === '';
};

const initialize = (options, logger) => {
    logger.info({message: 'Initialize migration'});
    return {
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
            ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(ctx.options.url);
            ctx.fileCache = new fsUtils.FileCache(`beehiiv-${ctx.options.cacheName}`, {
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
    };
};

const getFullTaskList = (options, logger) => {
    return [
        initialize(options, logger),
        {
            title: 'Read beehiiv content',
            task: async (ctx) => {
                ctx.timings.readContent = Date.now();
                try {
                    ctx.result = await beehiivIngest({
                        options
                    }, ctx.logger);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'beehiiv-export-data.json');
                } catch (error) {
                    ctx.logger.error({message: 'Failed to read beehiiv content', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Read beehiiv content',
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
                let tasks = ctx.webScraper.hydrate(ctx); // eslint-disable-line no-shadow
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
                let tasks = ctx.linkFixer.fix(ctx, task);
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
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 8. Convert post HTML -> MobileDoc
                ctx.timings.htmlToMobiledoc = Date.now();
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx);
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to convert HTML -> MobileDoc', error});
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
                } catch (error) {
                    ctx.logger.error({message: 'Failed to write Ghost import JSON File', error});
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
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-beehiiv-${ctx.options.cacheName}.zip`});
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
                    ctx.logger.error({message: 'Failed to clear temporary cached files', error});
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
};

const getTaskRunner = (options, logger) => {
    let tasks = [];

    tasks = getFullTaskList(options, logger);

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};

export default {
    initialize,
    getFullTaskList,
    getTaskRunner
};
