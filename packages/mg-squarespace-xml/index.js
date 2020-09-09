const fs = require('fs').promises;
const normalize = require('./lib/normalize-xml');
const process = require('./lib/process');

module.exports = async (ctx) => {
    const input = await fs.readFile(ctx.options.pathToFile, 'utf-8');

    // normalize xml file (posts, pages, users, tags)
    const normalized = await normalize.all(input, ctx);

    // process the content
    const processed = await process(normalized, ctx);

    return processed;
};
