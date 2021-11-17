const revueAPI = require('@tryghost/mg-revue-api');
const mgJSON = require('@tryghost/mg-json');
const mgHtmlMobiledoc = require('@tryghost/mg-html-mobiledoc');
const MgWebScraper = require('@tryghost/mg-webscraper');
const MgImageScraper = require('@tryghost/mg-imagescraper');
const MgLinkFixer = require('@tryghost/mg-linkfixer');
const fsUtils = require('@tryghost/mg-fs-utils');
const makeTaskRunner = require('../lib/task-runner');

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
    const $ = require('cheerio');

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

module.exports.initialize = (options) => {
    return {
        title: 'Initializing Workspace',
        task: (ctx, task) => {
            ctx.options = options;

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.fileCache = new fsUtils.FileCache(ctx.options.pubName);
            ctx.webScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor);
            ctx.imageScraper = new MgImageScraper(ctx.fileCache);
            ctx.linkFixer = new MgLinkFixer();

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
        }
    };
};

module.exports.getInfoTaskList = (options) => {
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
module.exports.getFullTaskList = (options) => {
    return [
        this.initialize(options),
        {
            title: 'Fetch Content from Revue API',
            task: async (ctx) => {
                // 1. Read all content from the API
                try {
                    let tasks = await revueAPI.fetch.tasks(options, ctx);

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Process Revue API JSON',
            task: async (ctx) => {
                // 2. Convert Revue API JSON into a format that the migrate tools understand
                try {
                    ctx.result = revueAPI.process.all(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'revue-processed-data.json');
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Fetch missing metadata via WebScraper',
            task: (ctx) => {
                // 3. Pass the results through the web scraper to get any missing data
                let tasks = ctx.webScraper.hydrate(ctx);
                return makeTaskRunner(tasks, options);
            },
            skip: () => ['all', 'web'].indexOf(options.scrape) < 0
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
            task: (ctx) => {
                // 4. Format the data as a valid Ghost JSON file
                try {
                    ctx.result = mgJSON.toGhostJSON(ctx.result, ctx.options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Fetch images via ImageSraper',
            task: async (ctx) => {
                // 5. Pass the JSON file through the image scraper
                let tasks = ctx.imageScraper.fetch(ctx);
                return makeTaskRunner(tasks, options);
            },
            skip: () => ['all', 'img'].indexOf(options.scrape) < 0
        },
        {
            title: 'Update links in content via LinkFixer',
            task: async (ctx, task) => {
                // 6. Process the content looking for known links, and update them to new links
                let tasks = ctx.linkFixer.fix(ctx, task);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            // @TODO don't duplicate this with the utils json file
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 7. Convert post HTML -> MobileDoc
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx);
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
            task: async (ctx) => {
                // 9. Write a valid Ghost import zip
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

module.exports.getTaskRunner = (options) => {
    let tasks = [];

    if (options.info) {
        tasks = this.getInfoTaskList(options);
    } else {
        tasks = this.getFullTaskList(options);
    }

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};
