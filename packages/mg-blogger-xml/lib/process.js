const $ = require('cheerio');
const {slugify} = require('@tryghost/string');

function increaseImageSize(imgSrc) {
    const imgSizeRegExp = new RegExp('(/s[0-9]{2,4}/?)|(/w[0-9]{2,4}-h[0-9]{2,4}/)|(/w[0-9]{2,4}-h[0-9]{2,4}-p-k-no-nu/)', 'i');
    let largeImgSrc = imgSrc.replace(imgSizeRegExp, '/s2000/');
    return largeImgSrc;
}

module.exports.processContent = (html) => {
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false,
        normalizeWhitespace: true
    });

    // Unwrap images from tables
    $html('table.tr-caption-container').each((i, table) => {
        // If image is in a table, the first row is the image, the second is its caption
        if ($(table).find('img').length) {
            let imgSrc = $(table).find('img').attr('src');
            let imgCaption = $(table).find('tr').eq(1).text();
            let imgCaptionHTML = $(table).find('tr').find('td').eq(1).html();

            let $img = $(`<img src="${imgSrc}" alt="${imgCaption}"></img>`);
            let $caption = $(`<figcaption>${imgCaptionHTML}</figcaption>`);
            let $figure = $('<figure></figure>');

            $figure.append($img);
            $figure.append($caption);

            $(table).replaceWith($figure);
        }
    });

    // Clean up image tags and increase the dimensions
    $html('img').each((i, img) => {
        let imgSrc = $(img).attr('src');
        let largeImgSrc = increaseImageSize(imgSrc);
        $(img).attr('src', largeImgSrc);
        $(img).removeAttr('width');
        $(img).removeAttr('height');
        $(img).removeAttr('border');
    });

    // TODO: this should be a parser plugin
    // Wrap nested lists in HTML card
    $html('ul li ul, ol li ol, ol li ul, ul li ol').each((i, nestedList) => {
        let $parent = $(nestedList).parentsUntil('ul, ol').parent();
        $parent.before('<!--kg-card-begin: html-->');
        $parent.after('<!--kg-card-end: html-->');
    });

    /**
     * Context:
     * Blogger doesn't generally use semantic markup for post content (notable <p> tags
     * around paragraphs), instead favoring raw text in divs. The following converts that
     * content into something Mobiledoc can cleanly transform into clean HTML.
     *
     * If the initial markup is semantic, its outcome will be unaffected by these.
     */

    // Remove spacers
    $html('span.contentdescription').each((i, item) => {
        $(item).remove();
    });

    // Remove empty div tags
    $html('div').each((i, item) => {
        const content = $(item).html();

        if (content.trim() === '') {
            $(item).remove();
        }
    });

    // Remove <br>'s
    $html('br').each((i, item) => {
        $(item).remove();
    });

    // Change div to p tags and remove styles
    $html('div').each((i, item) => {
        $(item).removeAttr('style');
        $(item).removeAttr('class');
        item.tagName = 'p';
    });

    // convert HTML back to a string
    html = $html.html();

    return html;
};

module.exports.processTags = (postTags) => {
    const tags = [];

    Object.keys(postTags).forEach((key) => {
        const tagObj = postTags[key];
        const tagSlug = slugify(tagObj.attrs.term);

        if (!tagObj.attrs.term.includes('http://schemas.google.com')) {
            tags.push({
                url: `/tag/${tagSlug}`,
                data: {
                    slug: tagSlug,
                    name: tagObj.attrs.term
                }
            });
        }
    });

    return tags;
};

module.exports.processFeatureImage = (data) => {
    if (data && data[0].attrs.url) {
        const imgUrl = data[0].attrs.url;

        // Don't assign the default image (i.e. none was set)
        if (imgUrl.includes('default.jpg')) {
            return null;
        }

        const bigImgUrl = increaseImageSize(imgUrl);
        return bigImgUrl;
    } else {
        return null;
    }
};

module.exports.processPost = (bloggerPost, users, postLink, isDraft, {addTag}) => {
    const postType = 'post';
    const postStatus = (postLink.includes('#comment-form') || isDraft) ? 'draft' : 'published';
    const postSlug = postLink.substring(postLink.lastIndexOf('/') + 1).replace('.html', '');
    const publishedDate = bloggerPost.published[0];
    const updatedDate = bloggerPost.updated[0];
    const authorSlug = slugify(bloggerPost.author[0].name[0]);

    const post = {
        url: postLink,
        data: {
            slug: postSlug,
            title: (typeof bloggerPost.title[0].value === 'string') ? bloggerPost.title[0].value : '(Untitled)',
            status: postStatus,
            published_at: publishedDate,
            created_at: publishedDate,
            updated_at: updatedDate,
            type: postType,
            author: users ? users.find(user => user.data.slug === authorSlug) : null,
            tags: [],
            feature_image: null
        }
    };

    post.data.html = this.processContent(bloggerPost.content[0].value);

    post.data.tags = this.processTags(bloggerPost.category);

    post.data.feature_image = this.processFeatureImage(bloggerPost.media_thumbnail);

    post.data.tags.push({
        url: 'migrator-added-tag',
        data: {
            name: '#blogger'
        }
    });

    if (addTag) {
        post.data.tags.push({
            url: 'migrator-added-tag-2',
            data: {
                slug: addTag,
                name: addTag
            }
        });
    }

    return post;
};

module.exports.processPosts = (input, users, options) => {
    const postsOutput = [];

    input.feed.entry.forEach((item) => {
        const link = item.link.slice(-1)[0].attrs.href;

        const isPost = link.includes('.html');
        const isComment = link.includes('?showComment');
        const isDraft = (item && item.app_control && item.app_control[0] && item.app_control[0].app_draft[0] && item.app_control[0].app_draft[0] === 'yes') || false;

        // If this is a post and not a comment
        if ((isPost || isDraft) && !isComment) {
            postsOutput.push(this.processPost(item, users, link, isDraft, options));
        }
    });

    // don't return empty post objects
    return postsOutput.filter(post => post);
};

module.exports.processUsers = (input, options) => {
    const authorInfo = input.feed.author[0];
    const authorSlug = slugify(authorInfo.name[0]);

    return [
        {
            url: authorSlug,
            data: {
                slug: authorSlug,
                name: authorInfo.name[0],
                email: `${authorSlug}@${options.email}`
            }
        }
    ];
};

module.exports.all = async (input, {options}) => {
    const {drafts} = options;
    const output = {
        posts: [],
        users: []
    };

    if (input.length < 1) {
        return new Error('Input file is empty');
    }

    // Grab the URL of the site we're importing - Not used right now
    options.siteUrl = input.link;

    // Process users first, as we're using this information to populate the author data for posts
    output.users = this.processUsers(input, options);

    output.posts = this.processPosts(input, output.users, options);

    if (!drafts) {
        // Remove draft posts
        output.posts = output.posts.filter(post => post.data.status !== 'draft');
    }

    return output;
};
