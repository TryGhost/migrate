const parseMembers = require('./lib/parse-members-csv');
const process = require('./lib/process');

module.exports = async (ctx) => {
    const parsed = await parseMembers(ctx);
    const normalized = await process(parsed, ctx.options);

    return normalized;
};
