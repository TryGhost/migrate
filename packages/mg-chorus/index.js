import readZip from './lib/read-zip.js';
import process from './lib/processor.js';

export default (entries, options) => {
    let result = readZip(entries, options);

    let output = process.all({result, options});

    return output;
};
