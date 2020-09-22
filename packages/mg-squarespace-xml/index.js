const fs = require('fs').promises;
const process = require('./lib/process');

module.exports = async (ctx) => {
    const input = await fs.readFile(ctx.options.pathToFile, 'utf-8');

    // process xml file (posts, pages, users, tags)
    const processed = await process.all(input, ctx);

    return processed;
};
