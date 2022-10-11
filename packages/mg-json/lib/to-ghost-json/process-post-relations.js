import _ from 'lodash';
import ObjectID from 'bson-objectid';
import schema from '../utils/schema.js';

export default (json) => {
    json.users = json.users || [];
    json.tags = json.tags || []; // expected to be empty

    // We create these fresh as all relation processing should be done in here
    json.posts_authors = [];
    json.posts_tags = [];
    json.posts_meta = [];

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
        return json[location].find((item) => { // eslint-disable-line array-callback-return
            // @TODO: need to scrape, or post-process scrape for user and tag slugs
            if (item.data.id && item.data.id === match.data.id) {
                return item;
            } else if (item.data.slug && item.data.slug === match.data.slug) {
                return item;
            } else if (item.data.name && item.data.name === match.data.name) {
                return item;
            } else if (!_.isNil(item.url || match.url) && item.url === match.url) {
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
                user.data.id = new ObjectID();
                json.users.push(user);
            }

            if (user && !user.data.id) {
                user.data.id = new ObjectID();
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
                tag.data.id = new ObjectID();
                json.tags.push(tag);
            }

            if (tag && !tag.data.id) {
                tag.data.id = new ObjectID();
            }

            json.posts_tags.push({
                post_id: postData.id,
                tag_id: tag.data.id
            });
        });
    };

    const processPostMeta = (postData) => {
        let postMeta = {
            post_id: postData.id
        };

        // List from https://github.com/TryGhost/Ghost/blob/main/core/server/data/schema/schema.js#L63-L79
        const metaKeys = [
            'og_image',
            'og_title',
            'og_description',
            'twitter_image',
            'twitter_title',
            'twitter_description',
            'meta_title',
            'meta_description',
            'email_subject',
            'frontmatter',
            'feature_image_alt',
            'feature_image_caption',
            'email_only'
        ];

        metaKeys.forEach((item) => {
            if (postData[item]) {
                postMeta[item] = postData[item];
                delete postData[item];
            }
        });

        json.posts_meta.push(postMeta);

        return postData;
    };

    const processPostRelations = (post) => {
        try {
            // Ensure we have a post ID
            if (!post.data.id) {
                post.data.id = new ObjectID();
            }

            processPostAuthors(post.data);
            processPostTags(post.data);
            post.data = processPostMeta(post.data);
        } catch (error) {
            error.reference = post.url;
            throw error;
        }
    };

    json.posts.forEach(processPostRelations);

    return json;
};
