import {processTxt} from './lib/process.js';

export default async (args: any, logger?: any) => {
    let result = await processTxt({txtPath: args.txtPath});
    return result;
};
