const $ = require('cheerio');
const url = require('url');

const VideoError = ({src, postUrl}) => {
    let error = new Error(`Unsupported video ${src} in post ${postUrl}`);

    error.errorType = 'VideoError';
    error.src = src;
    error.url = postUrl;

    return error;
};

module.exports.processAuthor = (data) => {
    return {
        url: data.url,
        data: {
            slug: data.url
        }
    };
};

module.exports.processContent = (html, postUrl, errors) => {
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
        // Handle blockquotes with multiple p tags as children and
        // 1. remove the p tags
        // 2. separate them with line breaks
        // This way, mobiledoc treats multiple p tag children correctly as one blockquote
        // instead of creating a blockquote for each one.
        $html('blockquote > p + p').each((i, el) => {
            let $blockquote = $(el).parents('blockquote');

            if ($blockquote.children('p').length > 0) {
                let newBlockquoteContent = '';
                $blockquote.children('p').each((j, p) => {
                    if (j < $blockquote.children('p').length - 1) {
                        newBlockquoteContent += `${$(p).html()}</br></br>`;
                    } else {
                        newBlockquoteContent += $(p).html();
                    }
                });
                $blockquote.html(newBlockquoteContent);
            }
        });

        // TODO: this should be a parser plugin
        $html('table').each((i, table) => {
            if ($(table).parents('table').length < 1) {
                // don't wrap a nested table again
                $(table).before('<!--kg-card-begin: html-->');
                $(table).after('<!--kg-card-end: html-->');
            }
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
module.exports.processPost = (data, errors) => {
    const post = {
        url: data.url,
        data: {
            slug: data.id,
            title: data.title,
            meta_title: data.page_title || data.title,
            custom_excerpt: data.description,
            status: data.active ? 'published' : 'draft',
            published_at: data.sent_at,
            tags: [
                {
                    url: 'newsletter', data: {name: 'newletter'}
                },
                {
                    url: 'migrator-added-tag', data: {name: '#revue'}
                }
            ]
        }
    };

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = this.processContent(post.data.html, post.url, errors);

    return post;
};

module.exports.processPosts = (posts, info, errors) => {
    return posts.map(post => this.processPost(post, errors));
};

module.exports.all = ({result, info, errors}) => {
    console.log('module.exports.all -> result', result);
    const output = {
        posts: this.processPosts(result.posts, info, errors),
        users: this.processAuthor(result.user, info, errors)
    };

    return output;
};
