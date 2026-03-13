import {extname} from 'path';
import {xmlUtils, domUtils} from '@tryghost/mg-utils';
import {slugify} from '@tryghost/string';
import SimpleDom from 'simple-dom';
import audioCard from '@tryghost/kg-default-cards/lib/cards/audio.js';
import errors from '@tryghost/errors';
import {decode} from 'html-entities';

const htmlToTextTrimmed = (html, max) => {
    let noHtml = html.replace(/<[^>]+>/g, ' ').replace(/\r?\n|\r/g, ' ').replace(/ {2,}/, ' ').trim();
    return noHtml && noHtml.length > max ? noHtml.slice(0,max).split(' ').slice(0, -1).join(' ') : noHtml;
};

const processUser = (sqUser) => {
    const login = sqUser['wp:author_login'] || '';
    const slug = slugify(login);
    const email = sqUser['wp:author_email'] || '';
    const name = sqUser['wp:author_display_name'] || '';

    return {
        url: slug,
        login: login,
        data: {
            slug: slug,
            name: name,
            email: (email.length) ? email : `${slug}@example.com`
        }
    };
};

const processContent = (html, options) => {
    if (!html) {
        return '';
    }

    const parsed = domUtils.parseFragment(html);

    if (options?.removeSelectors) {
        parsed.$(options.removeSelectors).forEach((el) => {
            el.remove();
        });
    }

    parsed.$('.sqs-audio-embed').forEach((el) => {
        let audioSrc = el.getAttribute('data-url');
        let audioTitle = el.getAttribute('data-title');

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: audioSrc,
                title: audioTitle
            }
        };

        const buildCard = audioCard.render(cardOpts);
        const cardHTML = buildCard.nodeValue;

        domUtils.replaceWith(el, cardHTML);
    });

    parsed.$('.newsletter-form-wrapper').forEach((el) => {
        el.remove();
    });

    // squarespace images without src
    parsed.$('img[data-src]').forEach((img) => {
        const src = img.getAttribute('data-src');
        if (img.classList.contains('thumb-image')) {
            // images with the `thumb-image` class might be a duplicate
            // to prevent migrating two images, we have to remove the false node
            // Walk backwards to find the noscript sibling
            let sibling = img.previousElementSibling;
            while (sibling) {
                if (sibling.tagName === 'NOSCRIPT') {
                    const noscriptImg = sibling.querySelector('img');
                    if (noscriptImg && noscriptImg.getAttribute('src') === src) {
                        img.remove();
                    }
                    break;
                }
                sibling = sibling.previousElementSibling;
            }
        } else {
            img.setAttribute('src', img.getAttribute('data-src'));
        }
    });

    parsed.$('figure blockquote').forEach((el) => {
        const nextSibling = el.nextElementSibling;
        let captionText = '';
        if (nextSibling && nextSibling.tagName === 'FIGCAPTION') {
            captionText = `<br><br>${domUtils.serializeChildren(nextSibling)}`;
            nextSibling.remove();
        }
        el.innerHTML = `<p>${domUtils.serializeChildren(el)}${captionText}</p>`;
    });

    parsed.$('.sqs-video-wrapper').forEach((el) => {
        const theHtml = decode(el.getAttribute('data-html'));
        const embedWrapper = el.closest('.embed-block-wrapper');
        const parent = embedWrapper ? embedWrapper.parentElement : null;

        if (parent) {
            domUtils.replaceWith(parent, `<figure class="kg-card kg-embed-card">${theHtml}</figure>`);
        }
    });

    // TODO: this should be a parser plugin
    // Wrap nested lists in HTML card
    parsed.$('ul li ul, ol li ol, ol li ul, ul li ol').forEach((nestedList) => {
        // Walk up to the nearest parent ul/ol (equivalent to parentsUntil('ul, ol').parent())
        let topList = nestedList.parentElement?.closest('ul, ol');
        if (topList) {
            domUtils.insertBefore(topList, '<!--kg-card-begin: html-->');
            domUtils.insertAfter(topList, '<!--kg-card-end: html-->');
        }
    });

    // Convert HTML back to a string
    html = parsed.html();

    // Trim whitespace
    html = html.trim();

    return html;
};

// The feature images is not "connected" to the post, other than it's located
// in the sibling `<item>` node.
const processFeatureImage = (items, index) => {
    const nextItem = items[index + 1];

    if (nextItem && nextItem['wp:attachment_url']) {
        let itemText = nextItem['wp:attachment_url'];
        let itemExt = extname(itemText);
        let allowedExt = ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz', '.ico', '.webp'];

        if (allowedExt.includes(itemExt) || itemText.includes('images.unsplash.com')) {
            return itemText;
        }
    }

    return;
};

const processTags = (sqCategories, fetchTags) => {
    const categories = [];
    const tags = [];

    sqCategories.forEach((taxonomy) => {
        if (fetchTags && taxonomy['@_domain'] === 'post_tag') {
            tags.push({
                url: `/tag/${taxonomy['@_nicename']}`,
                data: {
                    slug: taxonomy['@_nicename'],
                    name: taxonomy['#text']
                }
            });
        } else if (taxonomy['@_domain'] === 'category') {
            categories.push({
                url: `/tag/${taxonomy['@_nicename']}`,
                data: {
                    slug: taxonomy['@_nicename'],
                    name: taxonomy['#text']
                }
            });
        }
    });

    return categories.concat(tags);
};

const processPost = (sqPost, index, items, users, options) => {
    const {addTag, tags: fetchTags, url} = options;
    const postType = sqPost['wp:post_type'] || '';

    // only grab posts and pages
    if (postType !== 'attachment') {
        const featureImage = processFeatureImage(items, index);
        const creator = sqPost['dc:creator'] || '';
        const creatorSlug = slugify(creator);

        let postSlug = sqPost.link || '';
        postSlug = postSlug.replace(/(\.html)/i, '');
        postSlug = postSlug.split('/').pop();

        if (!postSlug || postSlug.indexOf('null') >= 0) {
            // drafts can have a post slug/link of `/null`
            postSlug = 'untitled';
        }

        // WP XML only provides a published date, we let's use that all dates Ghost expects
        const postDate = new Date(sqPost.pubDate || '');

        const postTitle = (sqPost.title && sqPost.title.length > 0) ? sqPost.title : false;

        const post = {
            url: `${url}${sqPost.link || ''}`,
            data: {
                slug: postSlug,
                title: decode(postTitle),
                status: (sqPost['wp:status'] || '') === 'publish' ? 'published' : 'draft',
                published_at: postDate,
                created_at: postDate,
                updated_at: postDate,
                feature_image: featureImage,
                type: postType,
                tags: []
            }
        };
        post.data.html = processContent(sqPost['content:encoded'] || '', options);

        const sqCategories = [].concat(sqPost.category || []);
        if (sqCategories.length >= 1) {
            post.data.tags = processTags(sqCategories, fetchTags);
        }

        if (addTag) {
            post.data.tags.push({
                url: 'migrator-added-tag', data: {slug: addTag, name: addTag}
            });
        }

        post.data.tags.push({
            url: 'migrator-added-tag-sqs', data: {name: '#sqs'}
        });

        if (!postTitle) {
            post.data.tags.push({
                url: 'migrator-added-tag-no-title', data: {name: '#no-title'}
            });

            post.data.title = htmlToTextTrimmed(post.data.html, 50);
        }

        if (users) {
            const foundUser = users.find((user) => {
                if (creator === user.login) {
                    return user;
                } else if (creator === user.data.name) {
                    return user;
                } else if (creator === user.data.email) {
                    return user;
                }

                return false;
            });

            if (foundUser) {
                post.data.author = foundUser;
            }
        } else if (creator) {
            post.data.author = {
                url: creatorSlug,
                data: {
                    name: creator,
                    slug: creatorSlug,
                    email: `${creatorSlug}@example.com`
                }
            };
        }

        if (!post?.data?.author) {
            post.data.author = {
                url: 'migrator-added-author',
                data: {
                    slug: 'migrator-added-author',
                    name: 'Migrator Added Author',
                    email: 'migrator-added-author@example.com'
                }
            };
        }

        return post;
    }
};

const processPosts = (items, users, options) => {
    const postsOutput = [];

    items.forEach((sqPost, index) => {
        postsOutput.push(processPost(sqPost, index, items, users, options));
    });

    // don't return empty post objects
    return postsOutput.filter(post => post);
};

const processUsers = (authors) => {
    return authors.map(sqUser => processUser(sqUser));
};

const all = async (input, {options}) => {
    const {drafts, posts, pages} = options;
    const output = {
        posts: [],
        users: []
    };

    if (input.length < 1) {
        return new errors.NoContentError({message: 'Input file is empty'});
    }

    const parsed = await xmlUtils.parseXml(input);
    const channel = parsed.rss.channel;

    // grab the URL of the site we're importing
    options.url = channel.link;

    // process users first, as we're using this information
    // to populate the author data for posts
    const authors = [].concat(channel['wp:author'] || []);
    output.users = processUsers(authors);

    const items = [].concat(channel.item || []);
    output.posts = processPosts(items, output.users, options);

    if (!drafts) {
        // remove draft posts
        output.posts = output.posts.filter(post => post.data.status !== 'draft');
    }

    if (!posts) {
        // remove posts
        output.posts = output.posts.filter(post => post.data.type !== 'post');
    }

    if (!pages) {
        // remove pages
        output.posts = output.posts.filter(post => post.data.type !== 'page');
    }

    return output;
};

export default {
    processUser,
    processContent,
    processFeatureImage,
    processTags,
    processPost,
    processPosts,
    processUsers,
    all
};
