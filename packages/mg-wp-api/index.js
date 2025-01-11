import fetch from './lib/fetch.js';
import process from './lib/processor.js';
import {processShortcodes} from './lib/process-shortcodes.js';
import * as utils from './lib/utils.js';

const discover = fetch.discover;

export default {
    discover,
    fetch,
    process,
    processShortcodes,
    utils
};
