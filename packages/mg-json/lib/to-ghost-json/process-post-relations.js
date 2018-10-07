const _ = require('lodash');
const schema = require('../utils/schema');

module.exports = (data) => {
    console.log('got user', data.users);
    let users = data.users || [];
    // @TODO: use bson objectid
    let authorId = 1;

    const findMatchingUser = (author) => {
        return users.find(user => {
            if (user.url === author.url) {
                return user;
            }
        });
    };

    const findPostAuthors = (post) => {
        // Find authors and remove all aliases
        const authors = _.pick(post, schema.AUTHOR_ALIASES);
        _.each(schema.AUTHOR_ALIASES, (alias) => {
            delete post[alias];
        });
        post.authors = [];

        if (_.isArray(authors)) {
            throw Error('Multiple Authors support is unimplemented');
        } else if (_.isObject(authors)) {
            let user = findMatchingUser(authors);
            if (!user) {
                user = authors;
                user.id = authorId;
                users.push(user);
                authorId += 1;
            }
            post.authors.push(user.id);
        } else if (_.isString(authors)) {
            throw Error('Author ID support is unimplemented');
        } else {
            throw Error('Author structure not understood');
        }
    };

    const findPostRelations = (post) => {
        findPostAuthors(post);
        // @TODO: implement tag relation matching
        // findPostTags(post);
    };

    data.posts.forEach(findPostRelations);

    return data;
};
