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

        // Only use plural key when it's actually an array (e.g. authors: [a, b]).
        // When single-author Co-Authors Plus posts set authors: undefined and author: <person>,
        // we must not take this branch or we'd process no one and orphan the post.
        if (_.has(postData, pluralForm) && Array.isArray(postData[pluralForm])) {
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
        const matchData = match.data || match;
        return json[location].find((item) => { // eslint-disable-line array-callback-return
            const itemData = item.data || item;
            // @TODO: need to scrape, or post-process scrape for user and tag slugs
            if (itemData.id && matchData.id && itemData.id === matchData.id) {
                return item;
            } else if (itemData.slug && matchData.slug && itemData.slug === matchData.slug) {
                return item;
            } else if (itemData.name && matchData.name && itemData.name === matchData.name) {
                return item;
            } else if (!_.isNil(item.url || match.url) && item.url === match.url) {
                return item;
            }
        });
    };

    // Normalise author to { url, data } shape so matching and IDs work
    const normaliseAuthor = (author) => {
        if (!author) {
            return author;
        }
        if (_.has(author, 'data') && _.isObject(author.data)) {
            return author;
        }
        return {
            url: author.url || author.slug || '',
            data: _.has(author, 'data') ? author.data : author
        };
    };

    const processPostAuthors = (postData) => {
        let postAuthors = findPostRelations(postData, 'author');

        _.each(postAuthors, (author) => {
            author = normaliseAuthor(author);
            if (!author || !(author.data || author)) {
                return;
            }
            const authorData = author.data || author;
            let user = findMatchingItem(author, 'users');

            if (!user) {
                user = author;
                if (!user.data) {
                    user = {url: authorData.slug || authorData.name || '', data: authorData};
                }
                user.data.id = user.data.id || new ObjectID();
                json.users.push(user);
            }

            const userData = user.data || user;
            if (!userData.id) {
                userData.id = new ObjectID();
            }

            json.posts_authors.push({
                post_id: postData.id,
                author_id: userData.id
            });
        });

        // Ensure no author-like keys remain on the post (Ghost expects users + posts_authors only)
        schema.AUTHOR_ALIASES.forEach((key) => {
            delete postData[key];
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
            // Support both wrapped ({ url, data: { ... } }) and flat post shapes
            const postData = post.data !== undefined ? post.data : post;
            if (!postData.id) {
                postData.id = new ObjectID();
            }

            processPostAuthors(postData);
            processPostTags(postData);
            const metaProcessed = processPostMeta(postData);
            if (post.data !== undefined) {
                post.data = metaProcessed;
            }
        } catch (error) {
            error.reference = post.url;
            throw error;
        }
    };

    if (json.posts) {
        json.posts.forEach(processPostRelations);
    }

    return json;
};
