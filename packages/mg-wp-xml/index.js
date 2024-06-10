import {readFileOrFolder} from './lib/read-file.js';
import process from './lib/process.js';

export default async (ctx) => {
    const input = await readFileOrFolder(ctx.options.pathToFile);

    // process xml file (posts, pages, users, tags)
    const processed = await process.all(input, ctx);

    return processed;
};
