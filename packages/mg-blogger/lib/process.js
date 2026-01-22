import {basename} from 'node:path';
import * as cheerio from 'cheerio';
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
    updatedSrc = updatedSrc.replace(/=s[0-9]{2,5}(-[a-z0-9#,*]{1,4})?/g, '=s2000');
    updatedSrc = updatedSrc.replace(/\/w[0-9]{2,5}-h[0-9]{2,5}(-[a-z0-9#,*]{1,4})?/g, '/w2000-h2000');
    updatedSrc = updatedSrc.replace(/=w[0-9]{2,5}-h[0-9]{2,5}(-[a-z0-9#,*]{1,4})?/g, '=w2000-h2000');
    return updatedSrc;
};

const getAllAttributes = function (el) {
    return el.attributes || Object.keys(el.attribs).map(
        name => ({name, value: el.attribs[name]})
    );
};

const handleFirstImage = (args) => {
    let {postData, html} = args;

    const $html = cheerio.load(html, {
        xml: {
            xmlMode: false,
            decodeEntities: false,
            scriptingEnabled: false
        }
    }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

    const firstContentElement = $html('*').first();

    if (firstContentElement[0].name === 'img') {
        $html(firstContentElement).remove();
        postData.feature_image = $html(firstContentElement).attr('src');
    } else if ($html(firstContentElement).text().trim() === '') {
        const firstContentElementImgSrc = $html(firstContentElement).find('img').attr('src');
        const firstContentElementImgBasename = firstContentElementImgSrc ? basename(firstContentElementImgSrc) : null;
        const firstContentElementAHref = $html(firstContentElement).find('a').attr('href');
        const firstContentElementAHrefBasename = firstContentElementAHref ? basename(firstContentElementAHref) : null;

        if (firstContentElementImgBasename === firstContentElementAHrefBasename) {
            $html(firstContentElement).remove();
            postData.feature_image = firstContentElementImgSrc;
        } else if (firstContentElementImgSrc && !firstContentElementAHref) {
            $html(firstContentElement).remove();
            postData.feature_image = firstContentElementImgSrc;
        } else {
            const firstContentElementImgBasenameNoSize = firstContentElementImgBasename.replace(/(.*)((-=|-|=)w[0-9]{2,5}-h[0-9]{2,5}|(-=|-|=)s[0-9]{2,5})/, '$1');
            const firstContentElementAHrefBasenameNoSize = firstContentElementAHrefBasename.replace(/(.*)((-=|-|=)w[0-9]{2,5}-h[0-9]{2,5}|(-=|-|=)s[0-9]{2,5})/, '$1');

            if (firstContentElementImgBasenameNoSize === firstContentElementAHrefBasenameNoSize) {
                $html(firstContentElement).remove();
                postData.feature_image = firstContentElementImgSrc;
            }
        }
    }

    postData.html = $html.html().trim();

    return postData;
};

const processHTMLContent = async (args) => {
    let {postData, html, options} = args;

    html = autop(html);

    const $html = cheerio.load(html, {
        xml: {
            xmlMode: false,
            decodeEntities: false,
            scriptingEnabled: false
        }
    }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

    $html('div.separator').each((i, el) => {
        $html(el).replaceWith(`<hr><div>${$html(el).html().trim()}</div>`);
    });

    $html('img').each((i, el) => {
        const imgSrc = $html(el).attr('src');
        const largerSrc = increaseImageSize(imgSrc);

        $html(el).attr('src', largerSrc);
        $html(el).removeAttr('width');
        $html(el).removeAttr('height');
    });

    $html('.tr-caption-container').each((i, el) => {
        const hasLink = $html(el).find('img').parent('a').length;
        const href = (hasLink) ? $html(el).find('img').parent('a').attr('href') : null;
        const imgSrc = $html(el).find('img').attr('src');
        const caption = $html(el).find('.tr-caption').html();
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

        $html(el).replaceWith(newCard);
    });

    $html('a > img').each((i, el) => {
        const aHref = $html(el).parent().attr('href');
        const imgSrc = $html(el).attr('src');

        const updatedaHref = increaseImageSize(aHref);
        const updatedImgSrc = increaseImageSize(imgSrc);

        // Don't touch Koenig cards
        if ($html(el).parent().attr('class')?.includes('kg-') || $html(el).attr('class')?.includes('kg-')) {
            return;
        }

        if (updatedaHref === updatedImgSrc) {
            $html(el).parent().replaceWith(`<img src="${imgSrc}">`);
        }
    });

    // Convert weird lists to real lists
    $html('span[style*="white-space: pre"]').each((i, el) => {
        const parent = $html(el).parent('div');
        if (parent.html()?.includes('•') || parent.html()?.includes('&#x2022;')) {
            parent[0].tagName = 'li';
            parent.find('span[style*="white-space: pre"]').each((ii, ell) => {
                $html(ell).remove();
            });
            parent.html(parent.html().replace('&#x2022;', '').trim());
        }
    });

    // Wrap <li>s in <ul>
    $html('li').each((i, el) => {
        if ($html(el).prev('ul').length) {
            $html(el).prev('ul').append($html(el));
        } else {
            $html(el).wrap('<ul></ul>');
        }
    });

    $html('div[style*="color"][style*="font-family"][style*="font-size"][style*="white-space: pre-line"]').each((i, el) => {
        $html(el).replaceWith(`<p>${$html(el).html().trim()}</p>`);
    });

    $html('span[style*="background-color"][style*="color"][style*="font-family"][style*="font-size"][style*="white-space: pre-line"]').each((i, el) => {
        $html(el).replaceWith(`<p>${$html(el).html().trim()}</p>`);
    });

    $html('div[style="text-align: center;"]').each((i, el) => {
        $html(el).replaceWith(`<p>${$html(el).html().trim()}</p>`);
    });

    $html('h1, h2, h3, h4, h5, h6').each((i, el) => {
        const attrs = getAllAttributes(el);

        const styleIndex = attrs.findIndex(e => e.name === 'style');
        if (styleIndex > -1) {
            if (attrs[styleIndex].value === 'text-align: left;') {
                $html(el).removeAttr(`style`);
            }
        }
    });

    $html('h3 b').each((i, el) => {
        const $el = $html(el);
        $el.replaceWith($el.html());
    });

    $html('div, p').each((i, el) => {
        const attrs = getAllAttributes(el);
        const children = $html(el).children();

        if ($html(el).html().trim() === '' && attrs.length === 0) {
            $html(el).remove();
        } else if ($html(el).html() === '&#xA0;') {
            $html(el).remove();
        } else if (attrs.length === 0 && children.length === 1 && children[0].name === 'img') {
            $html(el).replaceWith($html(el).html().trim());
        }
    });

    $html('p').each((i, el) => {
        if ($html(el).html().trim() === '' || $html(el).html() === '&#xA0;' || $html(el).html().trim() === '&nbsp;') {
            $html(el).remove();
        }
    });

    $html('div').each((i, el) => {
        const attrs = getAllAttributes(el);
        const children = $html(el).children();

        if (attrs.length === 0 && children.length === 0) {
            $html(el).replaceWith(`<p>${$html(el).html().trim()}</p>`);
        }
    });

    $html('iframe[src*="youtube.com"]').each((i, el) => {
        $html(el).attr('width', 160);
        $html(el).attr('height', 90);
    });

    // Convert back to plain HTML
    html = $html.html();

    // Trim whitespace
    html = html.trim();

    // Remove first element(s) if <hr>
    html = html.replace(/^(<hr\/?> ?)+/gm, '').trim();

    // Remove empty attributes
    html = html.replace(/=""/g, '');

    postData.html = html;

    if (options?.firstImageAsFeatured) {
        postData = handleFirstImage({
            postData,
            html
        });
    }

    return postData;
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

    post.data = await processHTMLContent({
        postData: post.data,
        html: postData.content,
        options
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
    // Filter out falsy items in the post list
    posts = posts.filter(i => i);

    return Promise.all(posts.map((post) => {
        return processPost(post, options);
    }));
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
