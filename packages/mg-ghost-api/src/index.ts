import fetch from './lib/fetch.js';
import process from './lib/processor.js';

const contentStats = fetch.contentStats;
const discover = fetch.discover;

export default {
    contentStats,
    discover,
    fetch,
    process
};
