const _ = require('lodash');
const schema = require('../utils/schema');

module.exports = (json) => {
    // These should be present and empty, even if there is no data
    json.users = json.users || [];
    json.tags = json.tags || [];

    // We create these fresh as all relation processing should be done in here
    json.posts_authors = [];
    json.posts_tags = [];

    // Dirty IDs
    let authorId = 1;
    let tagId = 1;
    let postId = 1;

    const findPostRelations = (postData, relation) => {
        let relations = [];
        let pluralForm = schema.RESOURCE_SINGULAR_TO_PLURAL[relation];

        if (_.has(postData, pluralForm)) {
            relations = postData[pluralForm];
            delete postData[pluralForm];
        } else if (_.has(postData, relation)) {
            relations.push(postData[relation]);
            delete postData[relation];
        }

        return relations;
    };

    const findMatchingItem = (match, location) => {
        if (!_.has(json, location)) {
            return;
        }
        return json[location].find((item) => {
            if (item.url === match.url) {
                return item;
            }
        });
    };

    const processPostAuthors = (postData) => {
        let postAuthors = findPostRelations(postData, 'author');

        _.each(postAuthors, (author) => {
            let user = findMatchingItem(author, 'users');

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

    const processPostTags = (postData) => {
        let postTags = findPostRelations(postData, 'tag');

        _.each(postTags, (postTag) => {
            let tag = findMatchingItem(postTag, 'tags');

            if (!tag) {
                tag = postTag;
                tag.data.id = tagId;
                json.tags.push(tag);
                tagId += 1;
            }

            json.posts_tags.push({
                post_id: postData.id,
                tag_id: tag.data.id
            });
        });
    };

    const processPostRelations = (post) => {
        // Ensure we have a post ID
        if (!post.data.id) {
            post.data.id = postId;
            postId += 1;
        }

        processPostAuthors(post.data);
        processPostTags(post.data);
    };

    json.posts.forEach(processPostRelations);

    return json;
};
