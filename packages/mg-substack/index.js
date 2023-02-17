import readZip, {contentStats} from './lib/read-zip.js';
import fsUtils from '@tryghost/mg-fs-utils';
import map from './lib/mapper.js';
import process from './lib/process.js';

const parseString = fsUtils.csv.parseString;

const ingest = async (ctx) => {
    // Extract the ZIP file
    let zipContent = readZip(ctx.options.pathToZip);

    // Convert the included CSV data to a JSON object
    zipContent.meta = parseString(zipContent.csv);

    // Remove the CSV data from the extracted data object
    delete zipContent.csv;

    // Map out the data into a format ready for other tools to consume
    const mapped = await map(zipContent, ctx.options);

    return mapped;
};

export default {
    ingest,
    process
};

export {
    contentStats
};
