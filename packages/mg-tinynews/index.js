import {mapContent} from './lib/mapper.js';

export default async (args, logger) => {
    let result = await mapContent(args, logger);

    return result;
};
