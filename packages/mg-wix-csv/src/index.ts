import {mapContent} from './lib/mapper.js';

export default async (args: {options: any}) => {
    const result = await mapContent(args);
    return result;
};

export {mapContent};
