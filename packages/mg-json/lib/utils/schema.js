// Information about the schema in Ghost 2.0
// This should probably be a separate module, and contain the _actual_ schema
// From Ghost core, along with a bunch of utility classes

// @TODO extend this to all importable Ghost resources
module.exports.RESOURCES = [
    'posts', 'users', 'tags', 'posts_tags'
];

module.exports.RESOURCE_SINGULAR_TO_PLURAL = {
    user: 'users',
    post: 'posts',
    tag: 'tags'
};

module.exports.AUTHOR_ALIASES = [
    'author',
    'authors',
    'primary_author',
    'author_id'
];
