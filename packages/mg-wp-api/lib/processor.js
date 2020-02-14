const fs = require('fs-extra');
const _ = require('lodash');

module.exports.processAuthor = (wpAuthor) => {
    return {
        url: wpAuthor.link,
        data: {
            id: wpAuthor.id && wpAuthor.id,
            slug: wpAuthor.slug,
            name: wpAuthor.name,
            bio: wpAuthor.description,
            profile_image: wpAuthor.avatar_urls && wpAuthor.avatar_urls['96'],
            email: wpAuthor.email && wpAuthor.email
        }
    };
};

module.exports.processTerm = (wpTerm) => {
    return {
        url: wpTerm.link,
        data: {
            slug: wpTerm.slug,
            name: wpTerm.name
        }
    };
};

module.exports.processTerms = (wpTerms) => {
    let categories = [];
    let tags = [];

    wpTerms.forEach((taxonomy) => {
        taxonomy.forEach((term) => {
            if (term.taxonomy === 'category') {
                categories.push(this.processTerm(term));
            }

            if (term.taxonomy === 'post_tag') {
                tags.push(this.processTerm(term));
            }
        });
    });

    return categories.concat(tags);
};

/**
 * Convert data to the intermediate format of
 * {
 *   posts: [
 *      {
 *          url: 'http://something',
 *          data: {
 *             title: 'blah',
*              ...
 *          }
 *      }
 *   ]
 * }
 */
module.exports.processPost = (wpPost, users) => {
    // @note: we don't copy excerpts because WP generated excerpts aren't better than Ghost ones but are often too long.
    const post = {
        url: wpPost.link,
        data: {
            slug: wpPost.slug,
            title: wpPost.title.rendered,
            comment_id: wpPost.id,
            html: wpPost.content.rendered,
            type: wpPost.type === 'post' ? 'post' : 'page',
            status: wpPost.status === 'publish' ? 'published' : 'draft',
            published_at: wpPost.date_gmt,
            author: users ? users.find((user) => {
                // Try to use the user data returned from the API
                return user.data.id === wpPost.author;
            }) : null
        }
    };

    if (wpPost._embedded['wp:featuredmedia']) {
        const wpImage = wpPost._embedded['wp:featuredmedia'][0];
        post.data.feature_image = wpImage.source_url;
    }

    if (wpPost._embedded.author && !post.data.author) {
        // use the data passed along the post if we couldn't match the user from the API
        const wpAuthor = wpPost._embedded.author[0];
        post.data.author = this.processAuthor(wpAuthor);
    }

    if (wpPost._embedded['wp:term']) {
        const wpTerms = wpPost._embedded['wp:term'];
        post.data.tags = this.processTerms(wpTerms);

        post.data.tags.push({
            url: 'migrator-added-tag', data: {name: '#wordpress'}
        });
    }

    return post;
};

module.exports.processPosts = (posts, users) => {
    return posts.map(post => this.processPost(post, users));
};

module.exports.processAuthors = (authors) => {
    return authors.map(author => this.processAuthor(author));
};



module.exports.all = async ({result: input, usersJSON}) => {
    if (usersJSON) {
        const mergedUsers = [];
        try {
            let passedUsers = await fs.readJSON(usersJSON);
            console.log(`Passed a users file with ${passedUsers.length} entries, processing now!`);
            await passedUsers.map((passedUser) => {
                const matchedUser = _.find(input.users, (fetchedUser) => {
                    if (fetchedUser.id && passedUser.id && fetchedUser.id === passedUser.id) {
                        return fetchedUser;
                    } else if (fetchedUser.slug && passedUser.slug && fetchedUser.slug === passedUser.slug) {
                        return fetchedUser;
                    } else if (fetchedUser.name && passedUser.name && fetchedUser.name === passedUser.name) {
                        return fetchedUser;
                    } else {
                        return false;
                    }
                });
                mergedUsers.push(Object.assign({}, passedUser, matchedUser));
            });
        } catch (error) {
            throw new Error('Unable to process passed uers file');
        }
        input.users = mergedUsers;
    }

    const output = {
        users: this.processAuthors(input.users)
    };

    output.posts = this.processPosts(input.posts, output.users);

    return output;
};
