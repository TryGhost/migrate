import {processTxt} from './lib/process.js';
import {memberStats} from './lib/read-txt.js';

export default async (args: any, logger?: any) => {
    let result = await processTxt({txtPath: args.txtPath});
    return result;
};

export {
    memberStats
};
