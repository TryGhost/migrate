/**
 * Migrate JSON - Ghost JSON generation utilities
 */

/**
 * Convert a JSON object into valid Ghost JSON
 * expects an object something like:
 *
 * {
 *   posts: [{
 *     url: 'http://theoriginal.url/of/the/resource',
 *     data: {
 *       title: 'the data we've managed to get so far,
 *       author: {
 *         name: 'nested resources that need processing'
 *       }
 *     }
 *   }]
 * }
 */
import toGhostJSON from './lib/to-ghost-json/index.js';
import hydrate from './lib/to-ghost-json/hydrate.js';

// @TODO: validator
// import validate from './lib/validator.js';

export {
    toGhostJSON,
    hydrate
};
