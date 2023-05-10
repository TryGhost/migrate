import $ from 'cheerio';
import {slugify, stripInvisibleChars} from '@tryghost/string';
import SimpleDom from 'simple-dom';
import audioCard from '@tryghost/kg-default-cards/lib/cards/audio.js';

const durationToSeconds = (duration) => {
    if (duration.includes(':')) {
        const durationParts = duration.split(':');
        const durationTotalSeconds = (parseInt(durationParts[0]) * 60) + parseInt(durationParts[1]);
        return durationTotalSeconds;
    } else {
        return (parseInt(duration) * 60);
    }
};

const processContent = (libsynPost, options) => { // eslint-disable-line no-shadow
    const {useEmbed} = options;

    let html = libsynPost.description;

    const podcastTitle = libsynPost.title;
    const podcastThumb = libsynPost['itunes:image'].href;
    const podcastAudioSrc = libsynPost.link;

    if (useEmbed) {
        const podcastID = libsynPost['libsyn:itemId'];
        const player = `<!--kg-card-begin: html--><iframe id="embed_${podcastID}" title="${podcastTitle}" style="border: none" src="//html5-player.libsyn.com/embed/episode/id/${podcastID}/custom-color/000000/" height="90" width="100%" scrolling="no" allowfullscreen="" webkitallowfullscreen="" mozallowfullscreen="" oallowfullscreen="" msallowfullscreen=""></iframe><!--kg-card-end: html-->`;
        html = `${player}${html}`;
    } else {
        const duration = durationToSeconds(libsynPost['itunes:duration']);
        const cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                thumbnailSrc: podcastThumb,
                src: podcastAudioSrc,
                title: podcastTitle,
                duration: duration
            }
        };
        const buildCard = audioCard.render(cardOpts);
        const cardHTML = buildCard.nodeValue;
        html = `${cardHTML}${html}`;
    }

    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    $html('p').each((i, el) => {
        const content = $(el).html().trim();
        const noInvisibleChars = stripInvisibleChars(content);
        const noInvisibleCharsLength = noInvisibleChars.length;

        if (noInvisibleCharsLength === 0 || content === '&#xA0;') {
            $(el).remove();
        }
    });

    $html('span[style="font-weight: 400;"]').each((i, el) => {
        $(el).replaceWith($(el).html().trim());
    });

    // Wrap nested lists in HTML card
    $html('ul li ul, ol li ol, ol li ul, ul li ol').each((i, nestedList) => {
        let $parent = $(nestedList).parentsUntil('ul, ol').parent();
        $parent.before('<!--kg-card-begin: html-->');
        $parent.after('<!--kg-card-end: html-->');
    });

    // convert HTML back to a string
    html = $html.html();

    return html.trim();
};

const processPost = (libsynPost, author, tags, options, errors) => { // eslint-disable-line no-shadow
    const {url, addTag, useFeedCategories, useItemKeywords} = options;

    // Get an ISO 8601 date - https://date-fns.org/docs/formatISO
    const dateNow = new Date().toISOString();

    const postSlug = slugify(libsynPost.title);
    const postDate = new Date(Date.parse(libsynPost.pubDate)).toISOString();

    const post = {
        url: `${url}/${postSlug}`,
        data: {
            slug: postSlug,
            title: libsynPost.title,
            created_at: postDate || dateNow,
            published_at: postDate || dateNow,
            updated_at: postDate || dateNow,
            type: 'post',
            status: 'published',
            tags: [],
            author: {
                url: 'migrator-added-author',
                data: author
            }
        }
    };

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = processContent(libsynPost, options, errors);

    if (addTag) {
        const addTagSlug = slugify(addTag);
        post.data.tags.push({
            url: `migrator-added-tag-${addTagSlug}`,
            data: {
                name: addTag,
                slug: addTagSlug
            }
        });
    }

    if (useFeedCategories && tags && tags.length) {
        tags.forEach((tag) => {
            const tagSlug = slugify(tag);

            post.data.tags.push({
                url: `migrator-added-tag-${tagSlug}`,
                data: {
                    name: tag,
                    slug: tagSlug
                }
            });
        });
    }

    if (useItemKeywords) {
        libsynPost['itunes:keywords'].split(',').forEach((tag) => {
            const tagSlug = slugify(tag);
            const tagName = tag;

            post.data.tags.push({
                url: `migrator-added-tag-${tagSlug}`,
                data: {
                    name: tagName,
                    slug: tagSlug
                }
            });
        });
    }

    post.data.tags.push({
        url: 'migrator-added-tag',
        data: {
            name: '#libsyn',
            slug: 'hash-libsyn'
        }
    });

    return post;
};
const processPosts = (posts, author, tags, options, errors) => { // eslint-disable-line no-shadow
    return posts.map(post => processPost(post, author, tags, options, errors));
};

const all = ({result, errors, options}) => { // eslint-disable-line no-shadow
    const output = {
        posts: processPosts(result.posts, result.author, result.tags, options, errors)
    };

    return output;
};

export default {
    processContent,
    processPost,
    processPosts,
    durationToSeconds,
    all
};
