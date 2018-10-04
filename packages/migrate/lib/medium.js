const mediumIngest = require('@tryghost/mg-medium-export');
const mgJSON = require('@tryghost/mg-json');
const fs = require('./fs');

/**
 * Migrate from Medium
 *
 * Wiring of the steps to migrate from medium.
 *
 * @param {String} pathToZip
 * @param {Boolean} verbose
 */
module.exports.migrate = (pathToZip) => {
    // 1. read the zip file
    let result = mediumIngest(pathToZip);
    // 2. pass the results through the web scraper to get any missing data

    // 3. convert post HTML -> MobileDoc

    // 4. Format the data as a valid Ghost JSON file
    result = mgJSON.toGhostJSON(result);

    // 5. Pass the JSON file through the image scraper

    // 6. Return a valid Ghost import zip
    let filename = fs.writeFile(result);

    return filename;
};
