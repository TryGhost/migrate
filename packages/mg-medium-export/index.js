import readZip, {contentStats} from './lib/read-zip.js';
import process from './lib/process.js';

export default async (pathToZip, options) => {
    let input = readZip(pathToZip, options);
    let output = await process(input);

    return output;
};

export {
    contentStats
};
