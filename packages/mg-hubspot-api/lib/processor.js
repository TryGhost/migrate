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
            html: hsPost.post_body,
            created_at: hsPost.created_time,
            feature_image: hsPost.featured_image,
            meta_description: hsPost.meta_description,
            status: hsPost.state.toLowerCase(),
            published_at: hsPost.publish_date

        }
    };

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
