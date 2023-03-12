import {extname, basename} from 'node:path';
import {slugify} from '@tryghost/string';

const cacheNameFromPath = (path) => {
    let ext = extname(path);
    let base = basename(path, ext);
    let slug = slugify(base);
    let noUnderscore = slug.replace(/_/g, '-');

    return noUnderscore;
};

export {
    cacheNameFromPath
};
