const readZip = require('./lib/read-zip');
const csv = require('@tryghost/mg-fs-utils').csv;
const map = require('./lib/mapper');
const process = require('./lib/process');

module.exports.ingest = async (ctx) => {
    // Extract the ZIP file
    let zipContent = readZip(ctx.options.pathToZip);

    // Convert the included CSV data to a JSON object
    zipContent.meta = csv.parseString(zipContent.csv);

    // Remove the CSV data from the extracted data object
    delete zipContent.csv;

    // Map out the data into a format ready for other tools to consume
    const mapped = await map(zipContent, ctx.options);

    return mapped;
};

module.exports.process = process;
