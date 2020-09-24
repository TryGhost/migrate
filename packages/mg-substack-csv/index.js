const parse = require('@tryghost/mg-fs-utils/lib/csv').parse;
const map = require('./lib/mapper');
const process = require('./lib/process');

module.exports = async (ctx) => {
    const input = await parse(ctx.options.pathToFile);
    const mapped = await map(input, ctx.options);
    const processed = await process(mapped, ctx);

    return processed;
};
