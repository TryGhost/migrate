import {basename} from 'node:path';
import {domUtils} from '@tryghost/mg-utils';
import autop from 'autop';
import sanitizeHtml from 'sanitize-html';
import {slugify} from '@tryghost/string';
import errors from '@tryghost/errors';
import SimpleDom from 'simple-dom';
import imageCard from '@tryghost/kg-default-cards/lib/cards/image.js';

const {serializeChildren, replaceWith, wrap} = domUtils;

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

const handleFirstImage = (args) => {
    let {postData, html} = args;

    return domUtils.processFragment(html, (parsed) => {
        const firstContentElement = parsed.body.children[0];

        if (!firstContentElement) {
            postData.html = parsed.html().trim();
            return postData;
        }

        if (firstContentElement.tagName === 'IMG') {
            postData.feature_image = firstContentElement.getAttribute('src');
            firstContentElement.remove();
        } else if ((firstContentElement.textContent || '').trim() === '') {
            const img = firstContentElement.querySelector('img');
            const a = firstContentElement.querySelector('a');
            const firstContentElementImgSrc = img?.getAttribute('src') ?? null;
            const firstContentElementImgBasename = firstContentElementImgSrc ? basename(firstContentElementImgSrc) : null;
            const firstContentElementAHref = a?.getAttribute('href') ?? null;
            const firstContentElementAHrefBasename = firstContentElementAHref ? basename(firstContentElementAHref) : null;

            if (firstContentElementImgBasename === firstContentElementAHrefBasename) {
                firstContentElement.remove();
                postData.feature_image = firstContentElementImgSrc;
            } else if (firstContentElementImgSrc && !firstContentElementAHref) {
                firstContentElement.remove();
                postData.feature_image = firstContentElementImgSrc;
            } else {
                const firstContentElementImgBasenameNoSize = firstContentElementImgBasename.replace(/(.*)((-=|-|=)w[0-9]{2,5}-h[0-9]{2,5}|(-=|-|=)s[0-9]{2,5})/, '$1');
                const firstContentElementAHrefBasenameNoSize = firstContentElementAHrefBasename.replace(/(.*)((-=|-|=)w[0-9]{2,5}-h[0-9]{2,5}|(-=|-|=)s[0-9]{2,5})/, '$1');

                if (firstContentElementImgBasenameNoSize === firstContentElementAHrefBasenameNoSize) {
                    firstContentElement.remove();
                    postData.feature_image = firstContentElementImgSrc;
                }
            }
        }

        postData.html = parsed.html().trim();
        return postData;
    });
};

const processHTMLContent = async (args) => {
    let {postData, html, options} = args;

    html = autop(html);

    html = domUtils.processFragment(html, (parsed) => {
        parsed.$('div.separator').forEach((el) => {
            replaceWith(el, `<hr><div>${serializeChildren(el).trim()}</div>`);
        });

        parsed.$('img').forEach((el) => {
            const imgSrc = el.getAttribute('src');
            const largerSrc = increaseImageSize(imgSrc);

            el.setAttribute('src', largerSrc);
            el.removeAttribute('width');
            el.removeAttribute('height');
        });

        parsed.$('.tr-caption-container').forEach((el) => {
            const img = el.querySelector('img');
            const imgParentA = img?.closest('a');
            const hasLink = !!imgParentA;
            const href = hasLink ? imgParentA.getAttribute('href') : null;
            const imgSrc = img?.getAttribute('src') ?? null;
            const captionEl = el.querySelector('.tr-caption');
            const caption = captionEl ? serializeChildren(captionEl) : '';
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

            replaceWith(el, newCard);
        });

        parsed.$('a > img').forEach((el) => {
            const parentA = el.parentElement;
            if (!parentA || parentA.tagName !== 'A') {
                return;
            }

            const aHref = parentA.getAttribute('href');
            const imgSrc = el.getAttribute('src');

            const updatedaHref = increaseImageSize(aHref);
            const updatedImgSrc = increaseImageSize(imgSrc);

            // Don't touch Koenig cards
            if (parentA.getAttribute('class')?.includes('kg-') || el.getAttribute('class')?.includes('kg-')) {
                return;
            }

            if (updatedaHref === updatedImgSrc) {
                replaceWith(parentA, `<img src="${imgSrc}">`);
            }
        });

        // Convert weird lists to real lists
        parsed.$('span[style*="white-space: pre"]').forEach((el) => {
            const parentDiv = el.closest('div');
            if (!parentDiv) {
                return;
            }

            const parentHTML = serializeChildren(parentDiv);
            if (parentHTML.includes('•') || parentHTML.includes('&#x2022;')) {
                // Change div to li by replacing with a new li element
                const newLi = parsed.document.createElement('li');
                // Copy children, remove the whitespace-pre spans
                newLi.innerHTML = serializeChildren(parentDiv);
                newLi.querySelectorAll('span[style*="white-space: pre"]').forEach((span) => {
                    span.remove();
                });
                newLi.innerHTML = newLi.innerHTML.replace('&#x2022;', '').trim();
                replaceWith(parentDiv, newLi);
            }
        });

        // Wrap <li>s in <ul>
        parsed.$('li').forEach((el) => {
            const prevSibling = el.previousElementSibling;
            if (prevSibling && prevSibling.tagName === 'UL') {
                prevSibling.appendChild(el);
            } else {
                wrap(el, '<ul></ul>');
            }
        });

        parsed.$('div[style*="color"][style*="font-family"][style*="font-size"][style*="white-space: pre-line"]').forEach((el) => {
            replaceWith(el, `<p>${serializeChildren(el).trim()}</p>`);
        });

        parsed.$('span[style*="background-color"][style*="color"][style*="font-family"][style*="font-size"][style*="white-space: pre-line"]').forEach((el) => {
            replaceWith(el, `<p>${serializeChildren(el).trim()}</p>`);
        });

        parsed.$('div[style="text-align: center;"]').forEach((el) => {
            replaceWith(el, `<p>${serializeChildren(el).trim()}</p>`);
        });

        parsed.$('h1, h2, h3, h4, h5, h6').forEach((el) => {
            const styleAttr = el.getAttribute('style');
            if (styleAttr === 'text-align: left;') {
                el.removeAttribute('style');
            }
        });

        parsed.$('h3 b').forEach((el) => {
            replaceWith(el, serializeChildren(el));
        });

        parsed.$('div, p').forEach((el) => {
            const attrs = el.attributes;
            const children = el.children;

            if (serializeChildren(el).trim() === '' && attrs.length === 0) {
                el.remove();
            } else if (serializeChildren(el) === '&#xA0;') {
                el.remove();
            } else if (attrs.length === 0 && children.length === 1 && children[0].tagName === 'IMG') {
                replaceWith(el, serializeChildren(el).trim());
            }
        });

        parsed.$('p').forEach((el) => {
            const innerHtml = serializeChildren(el);
            if (innerHtml.trim() === '' || innerHtml === '&#xA0;' || innerHtml.trim() === '&nbsp;') {
                el.remove();
            }
        });

        parsed.$('div').forEach((el) => {
            const attrs = el.attributes;
            const children = el.children;

            if (attrs.length === 0 && children.length === 0) {
                replaceWith(el, `<p>${serializeChildren(el).trim()}</p>`);
            }
        });

        parsed.$('iframe[src*="youtube.com"]').forEach((el) => {
            el.setAttribute('width', '160');
            el.setAttribute('height', '90');
        });

        // Convert back to plain HTML
        return parsed.html();
    });

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

    return post;
};

const processPosts = async (posts, options) => {
    // Filter out falsy items in the post list
    posts = posts.filter(i => i);

    const results = [];

    for (let i = 0; i < posts.length; i++) {
        results.push(await processPost(posts[i], options));
    }

    return results;
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
    increaseImageSize
};
