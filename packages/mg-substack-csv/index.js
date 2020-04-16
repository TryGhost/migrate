const parse = require('./lib/parse-csv');
const map = require('./lib/mapper');

module.exports = async (options) => {
    let input = await parse(options.pathToFile);
    let mapped = await map(input, options.url);

    return mapped;
};
