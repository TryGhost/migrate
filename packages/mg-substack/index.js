const readZip = require('./lib/read-zip');
const csv = require('@tryghost/mg-fs-utils').csv;
const map = require('./lib/mapper');
const process = require('./lib/process');

module.exports = async (ctx) => {
    let zipContent = readZip(ctx.options.pathToZip);
    zipContent.meta = csv.parseString(zipContent.csv);
    delete zipContent.csv;

    const mapped = await map(zipContent, ctx.options);
    const processed = await process(mapped, ctx);

    return processed;
};

module.exports.process = process;
