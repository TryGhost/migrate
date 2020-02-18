const htmlToText = require('html-to-text');
const $ = require('cheerio');

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
    let imgRegex = new RegExp(`^(<p>)?<img[^>]*?src="${featureImage}[^>]*?>(<\/p>)?`);

    if (imgRegex.test(bodyContent)) {
        bodyContent = bodyContent.replace(imgRegex, '');
    }

    if (imgRegex.test(summaryContent)) {
        summaryContent = summaryContent.replace(imgRegex, '');
    }

    post.data.html = bodyContent;
    post.data.feature_image = featureImage;
    post.data.custom_excerpt = this.createCleanExcerpt(summaryContent);
};

module.exports.processContent = (html) => {
    // Drafts can have empty post bodies
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    // Handle divs that contain hubspot scripts
    $html('div.wrapper').each((i, div) => {
        $(div).before('<!--kg-card-begin: html-->');
        $(div).after('<!--kg-card-end: html-->');
    });

    // Handle instagram embeds

    // Handle youtube embeds
    let figure = $('<figure></figure>');

    $html('div.hs-responsive-embed-wrapper iframe').each((i, el) => {
        let src = $(el).attr('src');
        if (src.startsWith('//')) {
            src = `https:${src}`;
        }
        src += '?feature=oembed';
        $(el).wrap(figure);
        $(el).attr('class', '');
        $(el).attr('style', '');
    });

    html = $html.html();

    return html;
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

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = this.processContent(post.data.html);

    // @TODO: improve author handling
    if (hsPost.blog_author) {
        post.data.author = this.processAuthor(hsPost.author, hsPost.blog_author);
    }

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
