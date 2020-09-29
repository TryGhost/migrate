const csv = require('@tryghost/mg-fs-utils').csv;
const map = require('./lib/mapper');
const process = require('./lib/process');

module.exports = async (ctx) => {
    const input = await csv.parse(ctx.options.pathToFile);
    const mapped = await map(input, ctx.options);
    const processed = await process(mapped, ctx);

    return processed;
};
