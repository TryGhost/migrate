const mediumIngest = require('@tryghost/mg-medium-export');

/**
 * Migrate from Medium
 *
 * Wiring of the steps to migrate from medium.
 *
 * @param {String} pathToZip
 * @param {Boolean} verbose
 */
module.exports.migrate = (pathToZip, verbose) => {
    // 1. read the zip file
    let result = mediumIngest(pathToZip);
    // 2. pass the results through the web scraper to get any missing data

    // 3. convert post HTML -> MobileDoc

    // 4. Format the data as a valid Ghost JSON file

    // 5. Pass the JSON file through the image scraper

    // 6. Return a valid Ghost import zip

    // Temporary output whilst we're in development
    if (verbose) {
        console.log(require('util').inspect(result, false, null)); // eslint-disable-line
    }
};
