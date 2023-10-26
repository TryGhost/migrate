import {process} from './lib/process.js';
import {memberStats} from './lib/member-stats.js';

export default async (args: any, logger?: any) => {
    let result = await process({pathToCsv: args.pathToCsv, pathToZip: args.pathToZip, addLabel: args.addLabel, includeUnsubscribed: args.includeUnsubscribed});
    return result;
};

export {
    memberStats
};
