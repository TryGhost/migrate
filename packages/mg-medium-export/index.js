import readZip, {contentStats} from './lib/read-zip.js';
import process from './lib/process.js';

export default (pathToZip, options) => {
    let input = readZip(pathToZip, options);
    let output = process(input, options);

    return output;
};

export {
    contentStats
};
