import fetch from './lib/fetch.js';
import process from './lib/processor.js';

const discover = fetch.discover;
const validateToken = fetch.validateToken;

export default {
    validateToken,
    discover,
    fetch,
    process
};
