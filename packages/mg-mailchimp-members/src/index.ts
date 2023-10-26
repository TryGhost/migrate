import {processCsv} from './lib/process.js';

export default async (args: any, logger?: any) => {
    let result = await processCsv({pathToCsv: args.pathToCsv, pathToZip: args.pathToZip, addLabel: args.addLabel, includeUnsubscribed: args.includeUnsubscribed});
    return result;
};
