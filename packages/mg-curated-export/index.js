import readZip from './lib/read-zip.js';
import process from './lib/process.js';

export default (pathToZip, ctx) => {
    let input = readZip(pathToZip, ctx);
    let output = process(input, ctx);

    return output;
};
