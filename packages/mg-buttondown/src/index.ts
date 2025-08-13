import {mapContent} from './lib/mapper.js';
import {contentStats, readZip} from './lib/read-zip.js';

export default async (args: any) => {
    const theZip = await readZip(args.options.pathToZip);
    args.posts = theZip.posts;
    args.json = theZip.json;

    const result = await mapContent(args);
    return result;
};

export {
    contentStats,
    readZip
};
