const parse = require('@tryghost/mg-fs-utils/lib/parse-csv');
// const normalizeCSV = require('./lib/normalize-csv');

module.exports = async (ctx) => {
    const signups = await parse(ctx.options.pathToAllSignups);
    // let subscribers = [];

    // if (ctx.hasSubscribers) {
    //     subscribers = await parse(ctx.options.subs);
    // }

    // const normalized = await normalizeCSV(signups, subscribers, ctx.options);

    return signups;
};
