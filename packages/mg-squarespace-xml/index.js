import {promises as fs} from 'node:fs';
import process from './lib/process.js';

export default async (ctx) => {
    const input = await fs.readFile(ctx.options.pathToFile, 'utf-8');

    // process xml file (posts, pages, users, tags)
    const processed = await process.all(input, ctx);

    return processed;
};
