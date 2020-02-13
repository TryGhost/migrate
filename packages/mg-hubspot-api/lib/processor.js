const htmlToText = require('html-to-text');

module.exports.processAuthor = (email, hsAuthor) => {
    return {
        url: hsAuthor.slug,
        data: {
            slug: hsAuthor.slug,
            name: hsAuthor.full_name,
            email,
            bio: hsAuthor.bio
        }
    };
};

module.exports.linkTopicsAsTags = (topicIds, tags) => {
    return topicIds.map(id => tags[id]);
};

module.exports.createCleanExcerpt = (summaryContent) => {
    let excerpt = htmlToText.fromString(summaryContent, {
        ignoreHref: true,
        ignoreImage: true,
        wordwrap: false
    });

    while (excerpt.length > 300) {
        let parts;
        let split;

        if (excerpt.match(/\n\n/)) {
            split = '\n\n';
        } else if (excerpt.match(/\.\s/)) {
            split = '. ';
        } else if (excerpt.match(/\s/)) {
            split = ' ';
        } else {
            excerpt = excerpt.substring(0, 297);
            excerpt += '...';
        }

        if (split) {
            parts = excerpt.split(split);

            if (parts.length > 1) {
                parts.pop();
                excerpt = parts.join(split);
                if (split === '. ') {
                    excerpt += '.';
                } else if (split === ' ') {
                    excerpt += '...';
                }
            }
        }
    }

    return excerpt;
};

module.exports.handleFeatureImageInContent = (post, hsPost) => {
    let bodyContent = hsPost.post_body;
    let summaryContent = hsPost.post_summary;
    let featureImage = hsPost.featured_image;

    // A rare case where we can be so certain of the structure here, that it's OK to remove some HTML using regex
    // Getting cheerio involved would be serious overkill!
    if (bodyContent.startsWith(`<img src="${featureImage}"`)) {
        bodyContent = bodyContent.replace(/^<img src=.*?>/, '');
    }

    if (summaryContent.startsWith(`<img src="${featureImage}"`)) {
        summaryContent = summaryContent.replace(/^<img src=.*?>/, '');
    }

    post.data.html = bodyContent;
    post.data.feature_image = featureImage;
    post.data.custom_excerpt = this.createCleanExcerpt(summaryContent);
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
module.exports.processPost = (hsPost, tags) => {
    const post = {
        url: hsPost.url,
        data: {
            slug: hsPost.slug,
            title: hsPost.html_title,
            comment_id: hsPost.analytics_page_id,
            created_at: hsPost.created_time,
            meta_description: hsPost.meta_description,
            status: hsPost.state.toLowerCase(),
            published_at: hsPost.publish_date

        }
    };

    // Hubspot has some complex interplay between HTML content and the featured image that we need to unpick
    this.handleFeatureImageInContent(post, hsPost);

    post.data.author = this.processAuthor(hsPost.author, hsPost.blog_author);

    post.data.tags = this.linkTopicsAsTags(hsPost.topic_ids, tags);

    return post;
};

module.exports.processTopics = (topics, url) => {
    let tags = {};

    topics.forEach((topic) => {
        let tag = {
            url: `${url}/topics/${topic.slug}`,
            data: {
                name: topic.name,
                slug: topic.slug,
                created_at: topic.created,
                updated_at: topic.updated

            }
        };

        tags[topic.id] = tag;
    });

    return tags;
};

module.exports.processPosts = (posts, info) => {
    let tags = this.processTopics(info.topics, info.blog.url);

    return posts.map(post => this.processPost(post, tags));
};

module.exports.all = (input, info) => {
    const output = {
        posts: this.processPosts(input.posts, info)
    };

    return output;
};
