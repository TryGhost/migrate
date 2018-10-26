const fs = require('fs-extra');
const path = require('path');

/**
 * Create files with our processed data
 * TODO: zip not just JSON!
 *
 * @param {Object} data - a valid Ghost JSON object
 * @param {Array} files - a list of image files to include
 */
module.exports.writeJSONFile = (data, files, options = {}) => {
    let filename = options.filename || `ghost-import-${Date.now()}.json`;
    let filepath = path.resolve(process.cwd(), filename);

    fs.outputJsonSync(filepath, data, {spaces: 2});

    return filepath;
};
