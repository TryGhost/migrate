import parse from './lib/parse-members-csv.js';
import process from './lib/process.js';

const parseMembers = async (ctx) => {
    const parsed = await parse(ctx);
    const normalized = await process(parsed, ctx);

    return normalized;
};

export default parseMembers;
