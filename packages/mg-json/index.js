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
module.exports.toGhostJSON = require('./lib/to-ghost-json');
module.exports.hydrate = require('./lib/to-ghost-json/hydrate');

// @TODO: validator
// module.exports.validate = require('./lib/validator');
