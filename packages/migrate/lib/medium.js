const mediumIngest = require('@tryghost/mg-medium-export');
const mgJSON = require('@tryghost/mg-json');
const converter = require('@tryghost/html-to-mobiledoc');
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
    // 1. Read the zip file
    let result = mediumIngest(pathToZip);

    // 2. Pass the results through the web scraper to get any missing data

    // 3. Format the data as a valid Ghost JSON file
    result = mgJSON.toGhostJSON(result);

    // 4. Pass the JSON file through the image scraper

    // 5. Convert post HTML -> MobileDoc
    result.data.posts.forEach((post) => {
        post.mobiledoc = JSON.stringify(converter.toMobiledoc(post.html));
    });

    // 6. Write a valid Ghost import zip
    let filename = fs.writeFile(result);

    // 7. Return the path to the file
    return filename;
};
