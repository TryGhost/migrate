const parse = require('./lib/parse-csv');
const map = require('./lib/mapper');

// TODO: add mapping config and other options
module.exports = async (filePath) => {
    let input = await parse(filePath);
    let mapped = await map(input);

    return mapped;
}
