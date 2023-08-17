import {mapContent} from './lib/mapper.js';

export default async (args: any, logger?: any) => {
    let result = await mapContent(args, logger);
    return result;
};
