const mediumIngest = require('@tryghost/mg-medium-export');
const mgJSON = require('@tryghost/mg-json');
const mgHtmlMobiledoc = require('@tryghost/mg-html-mobiledoc');
const MgScraper = require('@tryghost/mg-webscraper');
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
 * Migrate from Medium
 *
 * Wiring of the steps to migrate from medium.
 *
 * @param {String} pathToZip
 * @param {Object} options
 */
module.exports.migrate = async (pathToZip, options) => {
    // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
    let fileCache = new fsUtils.FileCache(pathToZip);
    const mediumScraper = new MgScraper(scrapeConfig);

    // 1. Read the zip file
    let result = mediumIngest(pathToZip);

    // 2. Pass the results through the web scraper to get any missing data
    if (options.scrape === 'all' || options.scrape === 'web') {
        result = await mediumScraper.hydrate(result);
    }

    // 3. Format the data as a valid Ghost JSON file
    result = mgJSON.toGhostJSON(result);

    // 4. Pass the JSON file through the image scraper
    if (options.scrape === 'all' || options.scrape === 'img') {
        // @TODO: image scraping
        result = result;
    }

    // 5. Convert post HTML -> MobileDoc
    result = mgHtmlMobiledoc.convert(result);

    // 6. Write a valid Ghost import zip
    // @TODO: write the zip, not just a JSON file
    let filename = fileCache.writeJSONFile(result);

    // 7. Return the path to the file
    return filename;
};
