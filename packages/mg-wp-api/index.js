import fetch from './lib/fetch.js';
import process from './lib/processor.js';
import {makeInlinerUrls} from './lib/utils.js';

const discover = fetch.discover;

export default {
    discover,
    fetch,
    process
};

export {
    makeInlinerUrls
};
