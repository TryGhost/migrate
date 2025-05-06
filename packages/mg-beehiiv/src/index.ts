import {mapContent} from './lib/mapper.js';

export default async (args: any) => {
    let result = await mapContent(args);
    return result;
};
