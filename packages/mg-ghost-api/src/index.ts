import fetch from './lib/fetch.js';

const contentStats = fetch.contentStats;
const discover = fetch.discover;

export default {
    contentStats,
    discover,
    fetch
};

export {mapPost} from './lib/mapper.js';
export type {GhostApiPost} from './lib/mapper.js';
