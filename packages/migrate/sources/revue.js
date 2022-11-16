import revueAPI from '@tryghost/mg-revue-api';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';
import {v4 as uuidv4} from 'uuid';
import $ from 'cheerio';
import {readFileSync} from 'node:fs';

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
        feature_image: {
            selector: 'meta[property="og:image"][content*="items"]',
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
            attr: 'content',
            convert: (x) => {
                if (!x) {
                    return;
                }
                return x.slice(0, 499);
            }
        },
        twitter_image: {
            selector: 'meta[name="twitter:image"], meta[name="twitter:image:src"], meta[property="twitter:image"], meta[property="twitter:image:src"]',
            attr: 'content'
        },
        twitter_title: {
            selector: 'meta[name="twitter:title"], meta[property="twitter:title"]',
            attr: 'content'
        },
        twitter_description: {
            selector: 'meta[name="twitter:description"], meta[property="twitter:description"]',
            attr: 'content',
            convert: (x) => {
                return x.slice(0, 499);
            }
        },
        // tags: {
        //     selector: 'meta[name="keywords"]',
        //     attr: 'content',
        //     convert: (x) => {
        //         if (!x) {
        //             return;
        //         }
        //         let tags = x.split(',');

        //         return tags.map(tag => tag.trim());
        //     }
        // },
        images: {
            selector: 'img[width="140"], img.link-image',
            how: 'html',
            convert: (html, $node) => {
                const scrapeImages = [];

                if ($node && $node.length >= 1) {
                    $node.each((i, img) => {
                        if (img.attribs.width === '140' && img.attribs.height === '140') {
                            // We only want to grab those thumbnail images and format the src, so we can compare
                            // it with the images we processed already
                            scrapeImages.push(img.attribs.src.replace(/(https?:\/\/(?:s3\.)?amazonaws\.com\/revue\/items\/images\/\d{3}\/\d{3}\/\d{3}\/)(?:thumb|mail|web)(\/\S*)(?:\?\S*)/gi, '$1web$2'));
                        }
                    });
                }
                return scrapeImages.length ? scrapeImages : null;
            }
        }

    }
};

const postProcessor = (scrapedData, data) => {
    // TODO: is there a better way to do this?

    // let primaryTag = addPrimaryTag.toLowerCase();

    // if (scrapedData.tags) {
    //     if (addPrimaryTag && scrapedData.tags.includes(primaryTag)) {
    //         scrapedData.tags = scrapedData.tags.filter(tag => tag !== primaryTag);
    //     }

    //     scrapedData.tags = scrapedData.tags.map((tag) => {
    //         return {
    //             url: `/tag/${tag}/`, data: {name: tag}
    //         };
    //     });
    //     data.tags = data.tags.concat(scrapedData.tags);

    //     delete scrapedData.tags;
    // }

    // To detect which Revue "bookmark card" or image card layout is used, we
    // need to use scraped data as the only reliable way of telling.
    // We already created kg-images in large resolution for each one, but now
    // have to detect and remove the ones, which are only displayed as thumbnails
    // because we only want to migrate the large images (width="600") from Revue
    if (scrapedData.images && scrapedData.images.length > 0) {
        const $html = $.load(data.html, {
            decodeEntities: false
        });

        // find all kg figure tags with the added class from the processor
        $html('.revue-image').each((i, revueImg) => {
            let imgChildren = $(revueImg).children('img');

            if ($(imgChildren).length > 0) {
                let src = $(imgChildren.get(0)).attr('src');

                // if the image is a scaped thumbnail, remove the whole
                // figure node
                if (scrapedData.images.includes(src)) {
                    $(revueImg).remove();
                } else {
                    $(revueImg).removeClass('revue-image');
                }
            }
        });

        data.html = $html.html();
    }

    delete scrapedData.images;

    return scrapedData;
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
            ctx.fileCache = new fsUtils.FileCache(`revue-${ctx.options.cacheName || uuidv4()}`, {
                tmpPath: ctx.options.tmpPath
            });
            ctx.webScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor);
            ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                sizeLimit: ctx.options.sizeLimit,
                allowImages: ctx.allowScrape.images,
                allowMedia: ctx.allowScrape.media,
                allowFiles: ctx.allowScrape.files
            }, ctx);

            ctx.linkFixer = new MgLinkFixer();

            ctx.timings = {
                fetchApiContent: false,
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
    };
};

const getInfoTaskList = (options) => {
    return [{
        title: 'Fetching from API',
        task: async (ctx) => {
            ctx.info = await revueAPI.fetch.discover(options);
        }
    }];
};

/**
 * getFullTaskList: Steps to Migrate from Hubspot
 *
 * Wiring of the steps to migrate from hubspot.
 *
 * @param {String} url
 * @param {Object} options
 */
const getFullTaskList = (options, logger) => {
    return [
        initialize(options, logger),
        {
            title: 'Fetch Content from Revue API',
            task: async (ctx) => {
                // 1. Read all content from the API
                ctx.timings.fetchApiContent = Date.now();
                try {
                    let tasks = await revueAPI.fetch.tasks(options, ctx);

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to fetch content from Revue API', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Fetch Content from Revue API',
                    duration: Date.now() - ctx.timings.fetchApiContent
                });
            }
        },
        {
            title: 'Process Revue API JSON',
            task: async (ctx) => {
                // 2. Convert Revue API JSON into a format that the migrate tools understand
                ctx.timings.processContent = Date.now();
                try {
                    ctx.result = revueAPI.process.all(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'revue-processed-data.json');
                } catch (error) {
                    ctx.logger.error({message: 'Failed to Process Revue API JSON', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Process Revue API JSON',
                    duration: Date.now() - ctx.timings.processContent
                });
            }
        },
        {
            title: 'Fetch missing metadata via WebScraper',
            skip: ctx => !ctx.allowScrape.web,
            task: (ctx) => {
                // 3. Pass the results through the web scraper to get any missing data
                ctx.timings.webScraper = Date.now();
                let tasks = ctx.webScraper.hydrate(ctx);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            skip: ctx => !ctx.allowScrape.web,
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Fetch missing metadata via WebScraper',
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
                    ctx.result = toGhostJSON(ctx.result, ctx.options);
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
            title: 'Fetch assets via AssetScraper',
            skip: (ctx) => {
                if ([ctx.allowScrape.images, ctx.allowScrape.media, ctx.allowScrape.files].every(element => element === false)) {
                    return true;
                }
            },
            task: async (ctx) => {
                // 6. Format the data as a valid Ghost JSON file
                ctx.timings.assetScraper = Date.now();
                let tasks = ctx.assetScraper.fetch(ctx);
                let assetScraperOptions = JSON.parse(JSON.stringify(options)); // Clone the options object
                assetScraperOptions.concurrent = false;
                return makeTaskRunner(tasks, assetScraperOptions);
            }
        },
        {
            skip: ctx => [ctx.allowScrape.images, ctx.allowScrape.media, ctx.allowScrape.files].every(element => element === false),
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Fetch assets via AssetScraper',
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
            // @TODO don't duplicate this with the utils json file
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

                        // read the file buffer
                        const fileBuffer = await readFileSync(ctx.outputFile.path);
                        // Upload the file to the storage
                        await storage.upload({body: fileBuffer, fileName: `gh-revue-${ctx.options.cacheName}.zip`});
                        // now that the file is uploaded to the storage, delete the local zip file
                        await fsUtils.zip.deleteFile(ctx.outputFile.path);
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

    if (options.info) {
        tasks = getInfoTaskList(options, logger);
    } else {
        tasks = getFullTaskList(options, logger);
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
