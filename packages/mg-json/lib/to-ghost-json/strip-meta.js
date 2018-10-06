const _ = require('lodash');
// @TODO extend this to all importable Ghost resources
const standardResources = [
    'posts', 'users', 'tags', 'posts_tags'
];
const singularResources = {
    user: 'users',
    post: 'posts',
    tag: 'tags'
};

/**
 * A resource might be a plain resource ready for import, or if it came from our migrate tooling,
 * probably an object with some metadata (like URL) and a `data` key with the resource fields
 * E.g.
 * {
 *   url: 'http://theoriginal.url/of/the/resource',
 *   data: {
 *     title: 'the data we've managed to get so far
 *   }
 * }
 */
const removeMeta = (resource) => {
    return resource.data || resource;
};

/**
 * We expect an object with keys that match Ghost resources
 * Iterate over each key and return only ones that we recognise
 */
module.exports = (input) => {
    return _.reduce(input, (data, value, key) => {
        // If this item is singular, convert to plural form
        if (_.includes(_.keys(singularResources), key)) {
            data[singularResources[key]] = [removeMeta(value)];
        // Else, map all values
        } else if (_.includes(standardResources, key)) {
            data[key] = _.map(value, removeMeta);
        }
        return data;
    }, {});
};
