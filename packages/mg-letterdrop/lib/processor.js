import {domUtils} from '@tryghost/mg-utils';
import {slugify} from '@tryghost/string';
import {_base as debugFactory} from '@tryghost/debug';

const {serializeChildren, replaceWith, insertBefore, insertAfter, isComment, getCommentData} = domUtils;

const debug = debugFactory('migrate:letterdrop:processor');

const processContent = (html, postUrl, options) => {
    // Drafts can have empty post bodies
    if (!html) {
        debug(`Post ${postUrl} has no HTML content`);
        return '';
    }

    // Replace empty paragraphs & list items
    html = html.replace(/<p><br><\/p>/g, '');
    html = html.replace(/<li><br><\/li>/g, '');

    html = domUtils.processFragment(html, (parsed) => {
        // Letterdrop supplies internal links in post content with `.com/c/`, but post URLs in JSON are `.com/p/`.
        // Lets normalise that
        parsed.$('a').forEach((el) => {
            let href = el.getAttribute('href');
            let linkRegEpx = new RegExp(`${options.url}/c/`);
            let newHref = href.replace(linkRegEpx, `${options.url}/p/`);
            el.setAttribute('href', newHref);
        });

        // Wrap nested lists in HTML card
        parsed.$('ul li ul, ol li ol, ol li ul, ul li ol').forEach((nestedList) => {
            const outermost = domUtils.lastParent(nestedList, 'ul, ol') ?? nestedList;

            // Don't double-wrap
            const prev = outermost.previousSibling;
            if (isComment(prev) && getCommentData(prev) === 'kg-card-begin: html') {
                return;
            }

            insertBefore(outermost, '<!--kg-card-begin: html-->');
            insertAfter(outermost, '<!--kg-card-end: html-->');
        });

        parsed.$('.quill-upload-image').forEach((el) => {
            const figure = el.querySelector('figure');

            if (figure) {
                replaceWith(el, figure);
                figure.removeAttribute('style');
                const figcaption = figure.querySelector('figcaption');
                if (figcaption) {
                    figcaption.removeAttribute('style');
                }
            }
        });

        parsed.$('.letterdrop-custom-button').forEach((el) => {
            const a = el.querySelector('a');
            const aHref = a?.getAttribute('href') ?? '';
            const referralsRegExp = new RegExp(`${options.url}/referrals/[a-zA-Z0-9]{24}`);

            if (aHref.match(referralsRegExp)) {
                el.remove();
            } else {
                const buttonText = a ? serializeChildren(a) : '';
                replaceWith(el, `<div class="kg-card kg-button-card kg-align-center"><a href="${aHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
            }
        });

        parsed.$('iframe[name="letterdrop-subscribe-input"]').forEach((el) => {
            replaceWith(el, `<div class="kg-card kg-button-card kg-align-center"><a href="${options.subscribeLink}" class="kg-btn kg-btn-accent">${options.subscribeText}</a></div>`);
        });

        parsed.$('blockquote').forEach((el) => {
            const classes = el.getAttribute('class') ?? null;
            if (!classes) {
                replaceWith(el, `<blockquote><p>${serializeChildren(el)}</p></blockquote>`);
            }
        });

        parsed.$('a').forEach((el) => {
            const href = el.getAttribute('href');
            const theDomain = options.url.replace(/(https?:\/\/)(www.)?/, '');

            if (href.includes(`${theDomain}/plans`) || href.includes(`${theDomain}/subscribe`) || href.includes(`${theDomain}/promo`)) {
                el.setAttribute('href', options.subscribeLink);
            }
        });

        // Convert HTML back to a string
        return parsed.html();
    });

    // Remove empty attributes
    html = html.replace(/=""/g, '');

    // Trim whitespace
    html = html.trim();

    return html;
};

const processPost = (data, options) => {
    const {addPrimaryTag} = options;

    const post = {
        url: data.url,
        data: {
            slug: data.slug,
            title: data.title,
            custom_excerpt: data.subtitle || null,
            meta_title: data.metaTitle || null,
            meta_description: data.metaDescription || null,
            status: 'published',
            created_at: data.publishedOn,
            updated_at: data.updated,
            published_at: data.publishedOn,
            feature_image: data.coverImage || null,
            tags: [],
            authors: []
        }
    };

    if (addPrimaryTag) {
        let tagObject = {
            url: `/tag/${slugify(addPrimaryTag)}`,
            data: {
                slug: slugify(addPrimaryTag),
                name: addPrimaryTag
            }
        };
        post.data.tags.push(tagObject);
        debug(`Adding supplied primary tag to ${data.slug} post object`, tagObject);
    }

    data.tags.forEach((tag) => {
        let tagSlug = slugify(tag);
        let tagObject = {
            url: `migrator-added-tag-${tagSlug}`,
            data: {
                slug: tagSlug,
                name: tag
            }
        };
        post.data.tags.push(tagObject);
        debug(`Adding tag to ${data.slug} post object`, tagObject);
    });

    post.data.tags.push({
        url: 'migrator-added-tag',
        data: {
            slug: 'hash-letterdrop',
            name: '#letterdrop'
        }
    });
    debug(`Adding #letterdrop tag to ${data.slug} post object`);

    if (data?.author?.name) {
        let authorSlug = slugify(data.author.name);
        let authorObject = {
            url: `/author/${authorSlug}`,
            data: {
                email: `${authorSlug}@example.com`,
                slug: authorSlug,
                name: data.author.name
            }
        };
        post.data.authors.push(authorObject);
        debug(`Adding author to ${data.slug} post object`, authorObject);
    }

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = processContent(data.body, post.url, options);

    return post;
};

const processPosts = (posts, options) => {
    const results = [];
    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        if (post) {
            results.push(processPost(post, options));
        }
    }
    return results;
};

const all = ({result, options}) => {
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
