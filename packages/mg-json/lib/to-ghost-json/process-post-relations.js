const _ = require('lodash');
const schema = require('../utils/schema');
const ObjectId = require('bson-objectid');

module.exports = (json) => {
    json.users = json.users || [];
    json.tags = json.tags || []; // expected to be empty

    // We create these fresh as all relation processing should be done in here
    json.posts_authors = [];
    json.posts_tags = [];

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
            if (item.data.name && item.data.name === match.data.name) {
                return item;
            } else if (item.url === match.url) {
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
                user.data.id = ObjectId.generate();
                json.users.push(user);
            }

            if (user && !user.data.id) {
                user.data.id = ObjectId.generate();
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
                tag.data.id = ObjectId.generate();
                json.tags.push(tag);
            }

            if (tag && !tag.data.id) {
                tag.data.id = ObjectId.generate();
            }

            json.posts_tags.push({
                post_id: postData.id,
                tag_id: tag.data.id
            });
        });
    };

    const processPostRelations = (post) => {
        try {
            // Ensure we have a post ID
            if (!post.data.id) {
                post.data.id = ObjectId.generate();
            }

            processPostAuthors(post.data);
            processPostTags(post.data);
        } catch (error) {
            error.reference = post.url;
            throw error;
        }
    };

    json.posts.forEach(processPostRelations);

    return json;
};
