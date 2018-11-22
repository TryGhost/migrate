const _ = require('lodash');

module.exports = (json) => {
    json.users = json.users || [];
    json.posts_authors = [];

    // @TODO: use bson objectid
    let authorId = 1;
    let postId = 1;

    const findPostAuthors = (postData) => {
        let authors = [];
        if (_.has(postData, 'authors')) {
            authors = postData.authors;
            delete postData.authors;
        } else if (_.has(postData, 'author')) {
            authors.push(postData.author);
            delete postData.author;
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

    const processPostAuthors = (postData) => {
        let authors = findPostAuthors(postData);

        _.each(authors, (author) => {
            let user = findMatchingUser(author);
            if (!user) {
                user = author;
                user.data.id = authorId;
                json.users.push(user);
                authorId += 1;
            }

            json.posts_authors.push({
                post_id: postData.id,
                author_id: user.data.id
            });
        });
    };

    const processPostRelations = (post) => {
        if (!post.data.id) {
            post.data.id = postId;
            postId += 1;
        }

        processPostAuthors(post.data);
        // @TODO: implement tag relation matching
        // processsPostTags(post);
    };

    json.posts.forEach(processPostRelations);

    return json;
};
