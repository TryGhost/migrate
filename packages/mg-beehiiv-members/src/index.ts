import {processCsv} from './lib/process.js';

export default async (args: any) => {
    let result = await processCsv({csvPath: args.csvPath});
    return result;
};
