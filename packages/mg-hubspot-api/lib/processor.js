import url from 'node:url';
import {htmlToText} from 'html-to-text';
import $ from 'cheerio';
import {formatISO, parse} from 'date-fns';
import errors from '@tryghost/errors';

const VideoError = ({src, postUrl}) => {
    let error = new errors.InternalServerError({message: `Unsupported video ${src} in post ${postUrl}`});

    error.errorType = 'VideoError';
    error.src = src;
    error.url = postUrl;

    return error;
};

const processAuthor = (hsAuthor) => {
    return {
        url: hsAuthor.slug,
        data: {
            slug: hsAuthor.slug,
            name: hsAuthor.full_name,
            email: hsAuthor.email,
            bio: hsAuthor.bio,
            profile_image: hsAuthor.avatar || hsAuthor.gravatar_url,
            facebook: hsAuthor.facebook,
            twitter: hsAuthor.twitter,
            website: hsAuthor.website
        }
    };
};

const linkTopicsAsTags = (topicIds, tags) => {
    return topicIds.map(id => tags[id]);
};

const createCleanExcerpt = (summaryContent = '') => {
    // Don't know why this doesn't happen in htmlToText, it should
    summaryContent = summaryContent.replace('&nbsp;', ' ');

    // Convert to text only
    let excerpt = htmlToText(summaryContent, {
        tags: {
            img: {format: 'skip'},
            a: {format: 'inline', options: {ignoreHref: true}},
            p: {format: 'inline', options: {uppercase: false}},
            h1: {format: 'inline', options: {uppercase: false}},
            h2: {format: 'inline', options: {uppercase: false}},
            h3: {format: 'inline', options: {uppercase: false}},
            h4: {format: 'inline', options: {uppercase: false}},
            h5: {format: 'inline', options: {uppercase: false}},
            h6: {format: 'inline', options: {uppercase: false}}
        },
        wordwrap: false,
        decodeOptions: {}
    });

    while (excerpt.length > 300) {
        let parts;
        let split;

        if (excerpt.match(/\n\n/)) {
            split = '\n\n';
        } else if (excerpt.match(/\.\n/)) {
            split = '.\n';
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
                if (split === '. ' || split === '.\n') {
                    excerpt += '.';
                } else if (split === ' ') {
                    excerpt += '...';
                }
            }
        }
    }

    return excerpt;
};

const handleFeatureImageInContent = (post, hsPost) => {
    let bodyContent = hsPost.post_body;
    let summaryContent = hsPost.post_summary;
    let featureImage = hsPost.featured_image;

    // A rare case where we can be so certain of the structure here, that it's OK to remove some HTML using regex
    // Getting cheerio involved would be serious overkill!
    let imgRegex = new RegExp(`^(<p>)?<img[^>]*?src="${featureImage}[^>]*?>(</p>)?`);

    if (imgRegex.test(bodyContent)) {
        bodyContent = bodyContent.replace(imgRegex, '');
    }

    if (imgRegex.test(summaryContent)) {
        summaryContent = summaryContent.replace(imgRegex, '');
    }

    post.data.html = bodyContent;
    post.data.feature_image = featureImage;

    post.data.custom_excerpt = createCleanExcerpt(summaryContent);
};

const processContent = (html, postUrl, errors) => { // eslint-disable-line no-shadow
    // Drafts can have empty post bodies
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    try {
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
            let parsed = url.parse(src);

            if (parsed.search) {
                // remove possible query params
                parsed.search = null;
            }
            src = url.format(parsed, {search: false});

            let $iframe = $('<iframe class="instagram-media instagram-media-rendered" id="instagram-embed-0" allowtransparency="true" allowfullscreen="true" frameborder="0" height="968" data-instgrm-payload-id="instagram-media-payload-0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;"></iframe>');
            let $script = $('<script async="" src="//www.instagram.com/embed.js"></script>');
            let $figure = $('<figure class="instagram"></figure>');

            $iframe.attr('src', `${src}embed/captioned/`);
            $figure.append($iframe);
            $figure.append($script);

            $(el).replaceWith($figure);
        });

        // Handle button links
        $html('p a.button, p a.roundupbutton').each((i, el) => {
            $(el).parent('p').before('<!--kg-card-begin: html-->');
            $(el).parent('p').after('<!--kg-card-end: html-->');
        });

        // Convert videos to HTML cards and report as errors
        // @TODO make this a parser plugin
        $html('video').each((i, el) => {
            $(el).before('<!--kg-card-begin: html-->');
            $(el).after('<!--kg-card-end: html-->');

            let src = $(el).find('source').attr('src');

            errors.push(VideoError({src, postUrl}));
        });

        // TODO: this should be a parser plugin
        // Wrap nested lists in HTML card
        $html('ul li ul, ol li ol, ol li ul, ul li ol').each((i, nestedList) => {
            let $parent = $(nestedList).parentsUntil('ul, ol').parent();
            $parent.before('<!--kg-card-begin: html-->');
            $parent.after('<!--kg-card-end: html-->');
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
    } catch (err) {
        console.log(postUrl); // eslint-disable-line no-console
        err.source = postUrl;
        throw err;
    }

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
const processPost = (hsPost, tags, errors) => { // eslint-disable-line no-shadow
    // Get an ISO 8601 date - https://date-fns.org/docs/formatISO
    const dateNow = formatISO(new Date());

    const post = {
        url: hsPost.url,
        data: {
            slug: hsPost.slug,
            title: hsPost.name || hsPost.html_title,
            comment_id: hsPost.analytics_page_id,
            created_at: formatISO(parse(hsPost.created_time)) || dateNow,
            published_at: formatISO(parse(hsPost.publish_date)) || dateNow,
            updated_at: formatISO(parse(hsPost.updated)) || dateNow,
            meta_title: hsPost.page_title || hsPost.title,
            meta_description: hsPost.meta_description,
            status: hsPost.state.toLowerCase()

        }
    };

    // Hubspot has some complex interplay between HTML content and the featured image that we need to unpick
    handleFeatureImageInContent(post, hsPost);

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = processContent(post.data.html, post.url, errors);

    if (hsPost.blog_author) {
        post.data.author = processAuthor(hsPost.blog_author);
    }

    post.data.tags = linkTopicsAsTags(hsPost.topic_ids, tags);

    post.data.tags.push({
        url: 'migrator-added-tag', data: {name: '#hubspot'}
    });

    return post;
};

const processTopics = (topics, blogUrl) => {
    let tags = {};

    topics.forEach((topic) => {
        let tag = {
            url: `${blogUrl}/topics/${topic.slug}`,
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

const processPosts = (posts, info, errors) => { // eslint-disable-line no-shadow
    let tags = processTopics(info.topics, info.blog.url);

    return posts.map(post => processPost(post, tags, errors));
};

const all = ({result, info, errors}) => { // eslint-disable-line no-shadow
    const output = {
        posts: processPosts(result.posts, info, errors)
    };

    return output;
};

export default {
    processAuthor,
    linkTopicsAsTags,
    createCleanExcerpt,
    handleFeatureImageInContent,
    processContent,
    processPost,
    processTopics,
    processPosts,
    all
};
