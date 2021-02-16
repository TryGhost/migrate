const parse = require('@tryghost/mg-fs-utils/lib/csv').parse;

module.exports = async (ctx) => {
    const {options} = ctx;

    // grab the main file "signups"
    let parsed = await parse(options.pathToFile);

    return parsed;
};
