import $ from 'cheerio';
import autop from 'autop';
import sanitizeHtml from 'sanitize-html';
import {slugify} from '@tryghost/string';
import errors from '@tryghost/errors';
import SimpleDom from 'simple-dom';
import imageCard from '@tryghost/kg-default-cards/lib/cards/image.js';

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);

const cleanExcerpt = (htmlContent) => {
    // Convert to text only
    const cleanedContent = sanitizeHtml(htmlContent, {
        allowedTags: ['b', 'i', 'em', 'strong', 'a'],
        allowedAttributes: {
            a: ['href', 'title', 'rel', 'target']
        }
    });

    return cleanedContent.trim();
};

const slugFromURL = (url) => {
    return url.split('/').pop().replace('.html', '');
};

const increaseImageSize = (src) => {
    // Increases the image size and removes special flags
    // https://developers.google.com/photos/library/guides/access-media-items
    let updatedSrc = src.replace(/\/s[0-9]{2,5}(-[a-z0-9#,*]{1,4})?/g, '/s2000');
    updatedSrc = updatedSrc.replace(/\/w[0-9]{2,5}-h[0-9]{2,5}(-[a-z0-9#,*]{1,4})?/g, '/w2000-h2000');
    return updatedSrc;
};

const getAllAttributes = function (el) {
    return el.attributes || Object.keys(el.attribs).map(
        name => ({name, value: el.attribs[name]})
    );
};

const processHTMLContent = async (args) => {
    let {html} = args;

    html = autop(html);

    const $html = $.load(html);

    $html('div.separator').each((i, el) => {
        $(el).replaceWith(`<hr><div>${$(el).html().trim()}</div>`);
    });

    $html('img').each((i, el) => {
        const imgSrc = $(el).attr('src');
        const largerSrc = increaseImageSize(imgSrc);

        $(el).attr('src', largerSrc);
        $(el).removeAttr('width');
        $(el).removeAttr('height');
    });

    $html('.tr-caption-container').each((i, el) => {
        const hasLink = $(el).find('img').parent('a').length;
        const href = (hasLink) ? $(el).find('img').parent('a').attr('href') : null;
        const imgSrc = $(el).find('img').attr('src');
        const caption = $(el).find('.tr-caption').html();
        const cleanedExcerpt = cleanExcerpt(caption);

        if (!imgSrc || imgSrc.length === 0) {
            return;
        }

        // Update image size so we get the biggest image
        const updatedImgSrc = increaseImageSize(imgSrc);

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: updatedImgSrc,
                caption: cleanedExcerpt
            }
        };

        if (hasLink) {
            const updatedHref = increaseImageSize(href);

            if (updatedImgSrc !== updatedHref) {
                cardOpts.payload.href = href;
            }
        }

        const newCard = serializer.serialize(imageCard.render(cardOpts));

        $(el).replaceWith(newCard);
    });

    $html('a > img').each((i, el) => {
        const aHref = $(el).parent().attr('href');
        const imgSrc = $(el).attr('src');

        const updatedaHref = increaseImageSize(aHref);
        const updatedImgSrc = increaseImageSize(imgSrc);

        // Don't touch Koenig cards
        if ($(el).parent().attr('class')?.includes('kg-') || $(el).attr('class')?.includes('kg-')) {
            return;
        }

        if (updatedaHref === updatedImgSrc) {
            $(el).parent().replaceWith(`<img src="${imgSrc}">`);
        }
    });

    // Convert weird lists to real lists
    $html('span[style*="white-space: pre"]').each((i, el) => {
        const parent = $(el).parent('div');
        if (parent.html()?.includes('•') || parent.html()?.includes('&#x2022;')) {
            parent[0].tagName = 'li';
            parent.find('span[style*="white-space: pre"]').each((ii, ell) => {
                $(ell).remove();
            });
            parent.html(parent.html().replace('&#x2022;', '').trim());
        }
    });

    // Wrap <li>s in <ul>
    $html('li').each((i, el) => {
        if ($(el).prev('ul').length) {
            $(el).prev('ul').append($(el));
        } else {
            $(el).wrap('<ul></ul>');
        }
    });

    $html('div[style*="color"][style*="font-family"][style*="font-size"][style*="white-space: pre-line"]').each((i, el) => {
        $(el).replaceWith(`<p>${$(el).html().trim()}</p>`);
    });

    $html('span[style*="background-color"][style*="color"][style*="font-family"][style*="font-size"][style*="white-space: pre-line"]').each((i, el) => {
        $(el).replaceWith(`<p>${$(el).html().trim()}</p>`);
    });

    $html('div[style="style="text-align: center;"]').each((i, el) => {
        $(el).replaceWith(`<p>${$(el).html().trim()}</p>`);
    });

    $html('div, p').each((i, el) => {
        const attrs = getAllAttributes(el);
        const children = $(el).children();

        if ($(el).html().trim() === '' && attrs.length === 0) {
            $(el).remove();
        } else if (attrs.length === 0 && children.length === 1 && children[0].name === 'img') {
            $(el).replaceWith($(el).html().trim());
        }
    });

    $html('div').each((i, el) => {
        const attrs = getAllAttributes(el);
        const children = $(el).children();

        if (attrs.length === 0 && children.length === 0) {
            $(el).replaceWith(`<p>${$(el).html().trim()}</p>`);
        }
    });

    // Convert back to plain HTML
    html = $html.html();

    // Trim whitespace
    html = html.trim();

    // Remove first element(s) if <hr>
    html = html.replace(/^(<hr\/?> ?)+/gm, '').trim();

    return html;
};

const processPost = async (postData, options) => {
    const {addTag} = options;

    const post = {
        url: postData.url,
        data: {
            slug: slugFromURL(postData.url),
            title: postData.title,
            status: 'published',
            published_at: new Date(postData.published),
            created_at: new Date(postData.published),
            updated_at: new Date(postData.updated),
            type: 'post',
            tags: []
        }
    };

    post.data.html = await processHTMLContent({
        html: postData.content
    });

    if (postData.author) {
        const authorName = postData.author.displayName.replace('&amp;', '&');
        const authorSlug = slugify(authorName);

        post.data.author = {
            url: `migrator-added-author-${authorSlug}`,
            data: {
                slug: authorSlug,
                email: `${authorSlug}@example.com`,
                name: authorName
            }
        };
    }

    if (postData.labels) {
        postData.labels.forEach((label) => {
            const cleanedLabel = label.replace('&amp;', '&');
            const labelSlug = slugify(cleanedLabel);

            post.data.tags.push({
                url: `migrator-added-tag-${labelSlug}`,
                data: {
                    slug: labelSlug,
                    name: cleanedLabel
                }
            });
        });
    }

    if (addTag) {
        const addTagSlug = slugify(addTag);

        post.data.tags.push({
            url: `migrator-added-tag-${addTagSlug}`,
            data: {
                slug: addTagSlug,
                name: addTag
            }
        });
    }

    if (postData?.blog?.id) {
        post.data.tags.push({
            url: `migrator-added-tag-site-id${postData.blog.id}`,
            data: {
                slug: `hash-blogger-site-${postData.blog.id}`,
                name: `#blogger-site-${postData.blog.id}`
            }
        });
    }

    post.data.tags.push({
        url: 'migrator-added-tag',
        data: {
            slug: 'hash-blogger',
            name: '#blogger'
        }
    });

    // console.log(post);

    return post;
};

const processPosts = async (posts, options) => {
    return Promise.all(posts.map(post => processPost(post, options)));
};

const all = async (input, {options}) => {
    const output = {
        posts: [],
        users: []
    };

    if (input.length < 1) {
        return new errors.NoContentError({message: 'Input file is empty'});
    }

    output.posts = await processPosts(input.posts, options);

    return output;
};

export default {
    processHTMLContent,
    processPost,
    processPosts,
    all
};

export {
    cleanExcerpt,
    slugFromURL,
    increaseImageSize,
    getAllAttributes
};
