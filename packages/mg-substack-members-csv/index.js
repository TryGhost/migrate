const parse = require('./lib/parse-members-csv');
const process = require('./lib/process');

module.exports = async (ctx) => {
    const parsed = await parse(ctx);
    const normalized = await process(parsed, ctx);

    return normalized;
};
