const $ = require('cheerio');
const htmlToText = require('html-to-text');
const {slugify} = require('@tryghost/string');

// TODO: we should probably make a new package for shared utils to process content
// as the same code snippet lives in the hubspot package
module.exports.createCleanExcerpt = (summaryContent = '') => {
    // Don't know why this doesn't happen in htmlToText, it should
    summaryContent = summaryContent.replace('&nbsp;', ' ');

    // Convert to text only
    let excerpt = htmlToText.fromString(summaryContent, {
        ignoreHref: true,
        ignoreImage: true,
        wordwrap: false,
        uppercaseHeadings: false,
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

module.exports.processUser = ($sqUser) => {
    const authorSlug = slugify($($sqUser).children('wp\\:author_login').text());

    return {
        url: authorSlug,
        data: {
            slug: authorSlug,
            name: $($sqUser).children('wp\\:author_display_name').text(),
            email: $($sqUser).children('wp\\:author_email').text()
        }
    };
};

module.exports.processContent = (html) => {
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false,
        normalizeWhitespace: true
    });

    // squarespace images without src
    $html('img[data-src]').each((i, img) => {
        const src = $(img).attr('data-src');
        if ($(img).hasClass('thumb-image')) {
            // images with the `thumb-image` class might be a duplicate
            // to prevent migrating two images, we have to remove the false node
            if ($($(img).prev('noscript').children('img').get(0)).attr('src') === src) {
                $(img).remove();
            }
        } else {
            $(img).attr('src', $(img).attr('data-src'));
        }
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

    return html;
};

// The feature images is not "connected" to the post, other than it's located
// in the sibling `<item>` node.
module.exports.processFeatureImage = ($sqPost) => {
    const $nextItem = $($sqPost).next().children('wp\\:attachment_url');

    if ($nextItem.length >= 1) {
        return $nextItem.text();
    }

    return;
};

module.exports.processTags = ($sqCategories, fetchTags) => {
    const categories = [];
    const tags = [];

    $sqCategories.each((i, taxonomy) => {
        if (fetchTags && $(taxonomy).attr('domain') === 'post_tag') {
            tags.push({
                url: `/tag/${$(taxonomy).attr('nicename')}`,
                data: {
                    slug: $(taxonomy).attr('nicename'),
                    name: $(taxonomy).text()
                }
            });
        } else if ($(taxonomy).attr('domain') === 'category') {
            categories.push({
                url: `/tag/${$(taxonomy).attr('nicename')}`,
                data: {
                    slug: $(taxonomy).attr('nicename'),
                    name: $(taxonomy).text()
                }
            });
        }
    });

    return categories.concat(tags);
};

module.exports.processPost = ($sqPost, users, {addTag, tags: fetchTags, siteUrl}) => {
    const postType = $($sqPost).children('wp\\:post_type').text();

    // only grab posts and pages
    if (postType !== 'attachment') {
        const featureImage = this.processFeatureImage($sqPost);
        const authorSlug = slugify($($sqPost).children('dc\\:creator').text());
        let postSlug = $($sqPost).children('link').text();

        if (!postSlug || postSlug.indexOf('null') >= 0) {
            // drafts can have a post slug/link of `/null`
            postSlug = 'untitled';
        }

        const post = {
            url: `${siteUrl}${$($sqPost).children('link').text()}`,
            data: {
                slug: $($sqPost).children('wp\\:post_name').text().replace(/(\.html)/i, ''),
                title: $($sqPost).children('title').text(),
                status: $($sqPost).children('wp\\:status').text() === 'publish' ? 'published' : 'draft',
                // TODO: properly format the date, as `pubDate` is not accepted by our importer
                published_at: $($sqPost).children('wp\\:post_date_gmt').text() || $($sqPost).children('pubDate').text(),
                feature_image: featureImage,
                tags: [],
                type: postType,
                author: users ? users.find(user => user.data.slug === authorSlug) : null
            }
        };

        post.data.html = this.processContent($($sqPost).children('content\\:encoded').text());

        post.data.custom_excerpt = this.createCleanExcerpt($($sqPost).children('excerpt\\:encoded').text());

        if ($($sqPost).children('category').length >= 1) {
            post.data.tags = this.processTags($($sqPost).children('category'), fetchTags);
        }

        post.data.tags.push({
            url: 'migrator-added-tag', data: {name: '#sqs'}
        });

        if (addTag) {
            post.data.tags.push({
                url: 'migrator-added-tag-2', data: {slug: addTag, name: addTag}
            });
        }

        if (!post.data.author) {
            if ($($sqPost).children('dc\\:creator').length >= 1) {
                post.data.author = {
                    url: authorSlug,
                    data: {
                        slug: authorSlug
                    }
                };
            } else {
                post.data.author = {
                    url: 'migrator-added-author',
                    data: {
                        slug: 'migrator-added-author'
                    }
                };
            }
        }

        return post;
    }

    return;
};

module.exports.processPosts = ($xml, users, options) => {
    const postsOutput = [];

    $xml('item').each((i, sqPost) => {
        postsOutput.push(this.processPost(sqPost, users, options));
    });

    // don't return empty post objects
    return postsOutput.filter(post => post);
};

module.exports.processUsers = ($xml) => {
    const usersOutput = [];

    $xml('wp\\:author').each((i, sqUser) => {
        usersOutput.push(this.processUser(sqUser));
    });

    return usersOutput;
};

module.exports.all = async (input, {options}) => {
    const {drafts, pages} = options;
    const output = {
        posts: [],
        users: []
    };

    if (input.length < 1) {
        return new Error('Input file is empty');
    }

    const $xml = $.load(input, {
        decodeEntities: false,
        xmlMode: true,
        lowerCaseTags: true // needed to find `pubDate` tags
    });

    // grab the URL of the site we're importing
    options.siteUrl = $xml('channel > link').text();

    // process users first, as we're using this information
    // to populate the author data for posts
    output.users = this.processUsers($xml);

    output.posts = this.processPosts($xml, output.users, options);

    if (!drafts) {
        // remove draft posts
        output.posts = output.posts.filter(post => post.data.status !== 'draft');
    }

    if (!pages) {
        // remove pages. absolute not supported by default and not tested!!
        output.posts = output.posts.filter(post => post.data.type !== 'page');
    }

    return output;
};
