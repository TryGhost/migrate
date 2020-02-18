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

    let figure = $('<figure></figure>');

    // Handle divs that contain hubspot scripts
    $html('div.wrapper').each((i, div) => {
        $(div).before('<!--kg-card-begin: html-->');
        $(div).after('<!--kg-card-end: html-->');
    });

    // Handle instagram embeds
    $html('script[src="//platform.instagram.com/en_US/embeds.js"]').remove();
    $html('#fb-root').each((i, el) => {
        if ($(el).prev().get(0).name === 'script') {
            $(el).prev().remove();
        }
        if ($(el).next().get(0).name === 'script') {
            $(el).next().remove();
        }

        $(el).remove();
    });

    $html('blockquote.instagram-media').each((i, el) => {
        let src = $(el).find('a').attr('href');
        let $iframe = $('<iframe class="instagram-media instagram-media-rendered" id="instagram-embed-0" allowtransparency="true" allowfullscreen="true" frameborder="0" height="968" data-instgrm-payload-id="instagram-media-payload-0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;"></iframe>');
        let $script = $('<script async="" src="//www.instagram.com/embed.js"></script>');
        let $figure = $('<figure class="instagram"></figure');

        $iframe.attr('src', `${src}embed/captioned/`);
        $figure.append($iframe);
        $figure.append($script);

        $(el).replaceWith($figure);
    });

    // Handle youtube embeds
    $html('div.hs-responsive-embed-wrapper iframe').each((i, el) => {
        let src = $(el).attr('src');
        if (src.startsWith('//')) {
            src = `https:${src}`;
        }
        src += '?feature=oembed';
    });

    $html('div.hs-responsive-embed-wrapper iframe').wrap(figure);
    $html('div.hs-responsive-embed-wrapper iframe').removeAttr('class');
    $html('div.hs-responsive-embed-wrapper iframe').removeAttr('style');

    // Handle button links
    $html('p a.button').each((i, el) => {
        $(el).parent('p').before('<!--kg-card-begin: html-->');
        $(el).parent('p').after('<!--kg-card-end: html-->');
    });

    // convert HTML back to a string
    html = $html.html();

    // Handle Wistia embeds
    // This is done with a regex replace, because we have to parse the string
    html = html.replace(/(<br>\n)?<p>{{ script_embed\('wistia', '([^']*)'.*?}}<\/p>(\n<br>)?/g, (m, b, p) => {
        return `<!--kg-card-begin: html-->
<script src="//fast.wistia.com/embed/medias/${p}.jsonp" async></script>
<script src="//fast.wistia.com/assets/external/E-v1.js" async></script>
<div class="wistia_embed wistia_async_${p}" style="height:349px;width:620px">&nbsp;</div>
<!--kg-card-end: html-->`;
    });

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
