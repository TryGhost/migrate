const _ = require('lodash');

module.exports = (json) => {
    json.users = json.users || [];

    // @TODO: use bson objectid
    let authorId = 1;

    const findPostAuthors = (post) => {
        let authors = [];
        if (_.has(post, 'authors')) {
            authors = post.authors;
            delete post.authors;
        } else if (_.has(post, 'author')) {
            authors.push(post.author);
            delete post.author;
        }

        return authors;
    };

    const findMatchingUser = (author) => {
        return json.users.find((user) => {
            if (user.url === author.url) {
                return user;
            }
        });
    };

    const processPostAuthors = (post) => {
        let authors = findPostAuthors(post);
        post.authors = [];

        _.each(authors, (author) => {
            let user = findMatchingUser(author);
            if (!user) {
                user = author;
                user.data.id = authorId;
                json.users.push(user);
                authorId += 1;
            }
            post.authors.push(user.data.id);
        });
    };

    const processPostRelations = (post) => {
        processPostAuthors(post.data);
        // @TODO: implement tag relation matching
        // processsPostTags(post);
    };

    json.posts.forEach(processPostRelations);

    return json;
};
