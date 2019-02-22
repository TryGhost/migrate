const fs = require('fs-extra');

/**
 * Read a JSON file containing Ghost JSON data
 *
 * @TODO: validate the path
 * @TODO: validate that we have a genuine Ghost JSON file
 * Right now this is the simplest version and so looks a bit weird in a file on it's own
 * but it will make more sense when there is validation in here.
 *
 * @param {String} jsonPath - name of file to read
 */
module.exports.read = async (jsonPath) => {
    return await fs.readJson(jsonPath);
};
