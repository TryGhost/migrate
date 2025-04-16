import {mapContent} from './lib/mapper.js';

export default async (args) => {
    let result = await mapContent(args);

    return result;
};
