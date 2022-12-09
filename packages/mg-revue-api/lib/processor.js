import url from 'node:url';
import $ from 'cheerio';
import {slugify} from '@tryghost/string';
import querystring from 'querystring';

const UTM_PARAMS = ['utm_campaign', 'utm_medium', 'utm_source'];

// TODO: move this to a shared util
const cleanUrl = (src) => {
    const parsed = url.parse(src);

    // default: remove any UTM search params from the URL
    if (parsed.search) {
        const parsedQuery = querystring.parse(parsed.search.replace(/^\?/i, ''), '&amp;');

        Object.keys(parsedQuery).forEach((param) => {
            if (UTM_PARAMS.includes(param) || !parsedQuery[param]) {
                delete parsedQuery[param];
            }
        });

        parsed.search = parsedQuery ? querystring.stringify(parsedQuery) : null;
    }

    return url.format(parsed);
};

const processContent = (html, postUrl, options) => {
    // Drafts can have empty post bodies
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    try {
        // Revue has bookmark cards in different formats that are not detectable to use by CSS classes
        // We can't guarantee for reliable meta information from the source and furthermore, Revue allows
        // custom text in their "bookmark card".
        // We're fetching the images in their largest solution, but remove thumbnails later, which we
        // can detect with our WebScraper.
        // The processing code for this lives the migrate package in the
        // revue source (scrapeConfig & postProcessor)
        $html('p > img[width]').each((i, img) => {
            // we add a `revue-image` class here to identify the node and compare the image src with
            // the web scraped results. If the images is rendered as a thumbnail, we'll remove the node
            const $figure = $(`<figure class="kg-card kg-image-card revue-image"></figure>`);
            // grab the wrapping parent, which contains the other links and the text
            const $imgParent = $(img).parent();

            // trick to grab the larger `web` version of the image
            let imgLarge = cleanUrl($(img).attr('src')).replace(/(https?:\/\/(?:s3\.)?amazonaws\.com\/revue\/items\/images\/\d{3}\/\d{3}\/\d{3}\/)(?:thumb)(\/\S*)/, '$1web$2');

            $(img).attr('src', imgLarge);

            $(img).removeAttr('width');
            $(img).removeAttr('height');
            $(img).removeAttr('style');

            $figure.append($(img));

            $imgParent.before($figure);
        });

        $html('p > blockquote').each((i, el) => {
            $(el).parent('p').replaceWith(`<blockquote><p>${$(el).html()}</p></blockquote>`);
        });

        // Link headings. Should be h3 tags in Ghost and have normalized links (removed UTM properties)
        $html('p > strong[style]').each((i, strong) => {
            strong.tagName = 'h3';
            $(strong).removeAttr('style');
            let linkChildren = $(strong).children('a');

            if ($(linkChildren).length === 2 && $(strong).text().indexOf('&mdash;') >= 0) {
                let relevantLink = $(linkChildren).get(0);
                $(relevantLink).attr('href', cleanUrl($(relevantLink).attr('href')));
                $(strong).html('');
                $(strong).append($(relevantLink));
            } else if ($(linkChildren).length > 0) {
                $(linkChildren).each((ii, anchor) => {
                    $(anchor).attr('href', cleanUrl($(anchor).attr('href')));
                });
            }
        });

        // TODO: this should be a parser plugin
        // Wrap nested lists in HTML card
        $html('ul li ul, ol li ol, ol li ul, ul li ol').each((i, nestedList) => {
            let $parent = $(nestedList).parentsUntil('ul, ol').parent();
            $parent.before('<!--kg-card-begin: html-->');
            $parent.after('<!--kg-card-end: html-->');
        });

        // Replace any subscribe link on the same domain with a specific link
        if (options.profileURL) {
            $html('a').each((i, anchor) => {
                let href = $(anchor).attr('href');

                let linkRegex = new RegExp(`^(${options.profileURL})/?([a-zA-Z0-9-]+)?(.*)?`, 'gmi');
                let matches = linkRegex.exec(href);

                if (matches) {
                    if (options.subscribeLink && matches[2] === 'members') {
                        $(anchor).attr('href', options.subscribeLink);
                    } else if (matches[2] === undefined) {
                        $(anchor).attr('href', '/');
                    }
                }
            });
        }

        // convert HTML back to a string
        html = $html.html();

        // Some images are wrapped in [caption][/caption] tags. We only need to replace
        // these square bracket tags with <figure> tags, as the image tag inside is fine as-is
        // `[caption align=\"alignnone\" width=\"980\"]<img>My caption[/caption]`
        html = html.replace(/\[caption[a-zA-Z0-9= "\\]{1,}](<img.*?>)(.*)\[\/caption]/gi, (all, m1, m2) => {
            return `<figure class="kg-card kg-image-card ${(m2) ? 'kg-card-hascaption' : ''}">${m1}${(m2) ? `<figcaption>${m2}</figcaption>` : ''}</figure>`;
        });

        // Handle Revue embeds
        // This is done with a regex replace, because we have to parse the string

        // Twitter embeds `[twitter <URL>]`
        html = html.replace(/\[tweet (https?:\/\/twitter\.com\/\S*\/\S*\/\d*)\]/gi, (m, src) => {
            return `<figure class="kg-card kg-embed-card">
<blockquote class="twitter-tweet"><a href="${src}"></a></blockquote>
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
</figure>`;
        });

        // YouTube embeds `[embed <https://wwww.youtube.com/watch?v=id>]`
        html = html.replace(/\[embed https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]*)\]/gi, (m, id) => {
            return `<!--kg-card-begin: embed--><figure class="kg-card kg-embed-card">
<iframe width="200" height="113" src="https://www.youtube.com/embed/${id}?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</figure><!--kg-card-end: embed-->`;
        });

        // YouTube embeds `[embed <https://youtu.be/id>]`
        html = html.replace(/\[embed https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]*)\]/gi, (m, id) => {
            return `<!--kg-card-begin: embed--><figure class="kg-card kg-embed-card">
<iframe width="200" height="113" src="https://www.youtube.com/embed/${id}?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</figure><!--kg-card-end: embed-->`;
        });
    } catch (err) {
        err.source = postUrl;
        throw err;
    }

    return html;
};

const processExcerpt = (description) => {
    if (!description) {
        return null;
    }

    const $html = $.load(description, {
        decodeEntities: false
    });

    const trimmedExcerpt = $html.text().trim();

    if (trimmedExcerpt.length === 0) {
        return null;
    }

    return trimmedExcerpt;
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
const processPost = (data, options) => {
    const {addPrimaryTag, email, pubName, createAuthors} = options;

    const slugRegexp = new RegExp(`https:\\/\\/www\\.getrevue\\.co\\/profile\\/[a-zA-Z0-9-_]+\\/issues\\/(\\S*)-${data.id}`);

    const post = {
        url: data.url,
        data: {
            slug: data.url.replace(slugRegexp, '$1') || slugify(data.title),
            title: data.title,
            meta_title: data.page_title || data.title,
            status: 'published',
            created_at: data.sent_at,
            updated_at: data.sent_at,
            published_at: data.sent_at,
            tags: [],
            authors: []
        }
    };

    if (addPrimaryTag) {
        post.data.tags.push({
            url: `/tag/${slugify(addPrimaryTag)}`,
            data: {
                name: addPrimaryTag
            }
        });
    }

    post.data.tags.push({
        url: 'migrator-added-tag',
        data: {
            slug: 'hash-revue',
            name: '#revue'
        }
    });

    if (createAuthors) {
        post.data.authors.push({
            url: `/author/${pubName}`,
            data: {
                email: (email) ? email : `${pubName}@example.com`,
                slug: pubName
            }
        });
    }

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = processContent(data.html, post.url, options);

    // The description has HTML in it, so process this to remove it and only return plain text
    post.data.custom_excerpt = processExcerpt(data.description);

    return post;
};

const processPosts = (posts, options) => {
    return posts.map(post => processPost(post, options));
};

const all = ({result, options}) => {
    // We don't ask for the publication name, so we'll infer it from the user profile instead
    // It's only used for author information
    options.profileURL = result.users.url;
    options.pubName = result.users.url.replace(/https:\/\/www\.getrevue\.co\/profile\/([a-zA-Z0-9-_]+)/, '$1');

    const output = {
        posts: processPosts(result.posts, options)
    };

    return output;
};

export default {
    processContent,
    processPost,
    processPosts,
    all
};
