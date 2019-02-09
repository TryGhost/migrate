const mediumIngest = require('@tryghost/mg-medium-export');
const mgJSON = require('@tryghost/mg-json');
const mgHtmlMobiledoc = require('@tryghost/mg-html-mobiledoc');
const MgScraper = require('@tryghost/mg-webscraper');
const MgImageScraper = require('@tryghost/mg-imagescraper');
const fsUtils = require('@tryghost/mg-fs-utils');

const scrapeConfig = {
    posts: {
        tags: {
            listItem: 'ul.tags > li',
            data: {
                url: {
                    selector: 'a',
                    attr: 'href'
                },
                // @TODO ideally we'd spec this using a data key, so the structure reflects what we expect back
                name: {
                    selector: 'a'
                }
            }
        },
        author: {
            selector: '.postMetaLockup--authorLockupForPost',
            data: {
                url: {
                    selector: 'a',
                    attr: 'href'
                },
                name: {
                    selector: 'a'
                },
                bio: {
                    selector: '.postMetaInline'
                },
                profile_image: {
                    selector: '.avatar-image',
                    attr: 'src'
                }
            }
        }
    }
};

/**
 * getTasks: Steps to Migrate from Medium
 *
 * Wiring of the steps to migrate from medium.
 *
 * @param {String} pathToZip
 * @param {Object} options
 */
module.exports.getTasks = (pathToZip, options) => {
    return [
        {
            title: 'Initialising',
            task: (ctx) => {
                // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
                ctx.fileCache = new fsUtils.FileCache(pathToZip);
                ctx.imageScraper = new MgImageScraper(ctx.fileCache);
                ctx.mediumScraper = new MgScraper(scrapeConfig);
            }
        },
        {
            title: 'Read Medium export zip',
            task: (ctx) => {
                // 1. Read the zip file
                ctx.result = mediumIngest(pathToZip);
            }
        },
        {
            title: 'Fetch missing data via WebScraper',
            task: async (ctx) => {
                // 2. Pass the results through the web scraper to get any missing data
                ctx.result = await ctx.mediumScraper.hydrate(ctx.result);
            },
            skip: () => ['all', 'web'].indexOf(options.scrape) < 0
        },
        {
            title: 'Format data as Ghost JSON',
            task: (ctx) => {
                // 3. Format the data as a valid Ghost JSON file
                ctx.result = mgJSON.toGhostJSON(ctx.result);
            }
        },
        {
            title: 'Fetch images via ImageSraper',
            task: async (ctx) => {
                // 4. Pass the JSON file through the image scraper
                ctx.result = await ctx.imageScraper.fetch(ctx.result);
            },
            skip: () => ['all', 'img'].indexOf(options.scrape) < 0
        },
        {
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 5. Convert post HTML -> MobileDoc
                ctx.result = mgHtmlMobiledoc.convert(ctx.result);
            }
        },
        {
            title: 'Write Ghost import zip',
            task: async (ctx) => {
                // 6. Write a valid Ghost import zip
                await ctx.fileCache.writeJSONFile(ctx.result);
                ctx.outputFile = fsUtils.zip.write(process.cwd(), ctx.fileCache.zipDir);
            }
        }
    ];
};
