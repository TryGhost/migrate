// Information about the schema in Ghost 2.0
// This should probably be a separate module, and contain the _actual_ schema
// From Ghost core, along with a bunch of utility classes

// @TODO extend this to all importable Ghost resources
const RESOURCES = [
    'posts', 'posts_authors', 'posts_meta', 'posts_tags', 'tags', 'users'
];

const RESOURCE_SINGULAR_TO_PLURAL = {
    user: 'users',
    author: 'authors',
    post: 'posts',
    tag: 'tags'
};

const AUTHOR_ALIASES = [
    'author',
    'authors',
    'primary_author',
    'author_id'
];

export default {
    RESOURCES,
    RESOURCE_SINGULAR_TO_PLURAL,
    AUTHOR_ALIASES
};
