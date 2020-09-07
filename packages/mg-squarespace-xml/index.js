const fs = require('fs').promises;
const process = require('./lib/process');
const normie = require('./lib/mapper');

module.exports = async (ctx) => {
    const input = await fs.readFile(ctx.options.pathToFile, 'utf-8');

    // normalise xml file
    const normalised = normie(input, ctx);
    // console.log('normalised', normalised);

    // process the content
    const processed = await process(normalised, ctx);
    // console.log('processed', processed);

    return processed;
};
