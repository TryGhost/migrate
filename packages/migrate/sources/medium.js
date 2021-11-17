const mediumIngest = require('@tryghost/mg-medium-export');
const mgJSON = require('@tryghost/mg-json');
const mgHtmlMobiledoc = require('@tryghost/mg-html-mobiledoc');
const MgWebScraper = require('@tryghost/mg-webscraper');
const MgImageScraper = require('@tryghost/mg-imagescraper');
const MgLinkFixer = require('@tryghost/mg-linkfixer');
const fsUtils = require('@tryghost/mg-fs-utils');
const {slugify} = require('@tryghost/string');
const makeTaskRunner = require('../lib/task-runner');

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
module.exports.getTaskRunner = (pathToZip, options) => {
    let tasks = [
        {
            title: 'Initializing Workspace',
            task: (ctx, task) => {
                ctx.options = options;

                // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
                ctx.fileCache = new fsUtils.FileCache(pathToZip);
                ctx.imageScraper = new MgImageScraper(ctx.fileCache);
                ctx.mediumScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor);
                ctx.linkFixer = new MgLinkFixer();

                task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
            }
        },
        {
            title: 'Read Medium export zip',
            task: async (ctx) => {
                // 1. Read the zip file
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
            title: 'Fetch missing data via WebScraper',
            task: (ctx) => {
                // 2. Pass the results through the web scraper to get any missing data
                let tasks = ctx.mediumScraper.hydrate(ctx); // eslint-disable-line no-shadow
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
                let tasks = ctx.imageScraper.fetch(ctx); // eslint-disable-line no-shadow
                return makeTaskRunner(tasks, options);
            },
            skip: () => ['all', 'img'].indexOf(options.scrape) < 0
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

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};
