module.exports.processAuthor = (wpAuthor) => {
    return {
        url: wpAuthor.link,
        data: {
            slug: wpAuthor.slug,
            name: wpAuthor.name,
            bio: wpAuthor.description,
            profile_image: wpAuthor.avatar_urls['96']
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
module.exports.processPost = (wpPost) => {
    const post = {
        url: wpPost.link,
        data: {
            slug: wpPost.slug,
            title: wpPost.title.rendered,
            comment_id: wpPost.id,
            //custom_excerpt: wpPost.excerpt.rendered, @TODO: strip html
            html: wpPost.content.rendered,
            type: wpPost.type === 'post' ? 'post' : 'page',
            status: wpPost.status === 'publish' ? 'published' : 'draft',
            published_at: wpPost.date_gmt
        }
    };

    if (wpPost._embedded['wp:featuredmedia']) {
        const wpImage = wpPost._embedded['wp:featuredmedia'][0];
        post.data.feature_image = wpImage.source_url;
    }

    if (wpPost._embedded.author) {
        const wpAuthor = wpPost._embedded.author[0];
        post.data.author = this.processAuthor(wpAuthor);
    }

    if (wpPost._embedded['wp:term']) {
        const wpTerms = wpPost._embedded['wp:term'];
        post.data.tags = this.processTerms(wpTerms);
    }

    return post;
};

module.exports.processPosts = (posts) => {
    return posts.map(post => this.processPost(post));
};

module.exports.all = (input) => {
    const output = {
        posts: [],
        pages: []
    };

    output.posts = this.processPosts(input.posts);

    return output;
};
