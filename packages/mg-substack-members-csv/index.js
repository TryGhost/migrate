import parse from './lib/parse-members-csv.js';
import process, {parseCompGift} from './lib/process.js';
import {memberStats} from './lib/read-csv.js';

export default async (ctx) => {
    const parsed = await parse(ctx);
    const normalized = await process(parsed, ctx);

    return normalized;
};

export {
    parseCompGift,
    memberStats
};
