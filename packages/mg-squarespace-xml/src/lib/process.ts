import {extname} from 'node:path';
import {dateUtils, domUtils, cardUtils, stringUtils, xmlUtils} from '@tryghost/mg-utils';
import {slugify} from '@tryghost/string';
import SimpleDom from 'simple-dom';
import {decode} from 'html-entities';
import type {ContentOptions, SquarespaceRecord, SquarespaceTag, SquarespaceUser} from './types.js';

const audioCard = cardUtils.getCard('audio');
const {ensureArray, getText} = xmlUtils;

/**
 * The publication and modification dates of an item, as `mg-wp-xml` reads them: `post_date_gmt`, then `pubDate`,
 * then `post_date` read as UTC, because never-published drafts have an empty `pubDate` and a zeroed
 * `post_date_gmt`. WordPress-style `Y-m-d H:i:s` fields carry no zone and are read as UTC. Squarespace pages have
 * only a `pubDate`.
 */
export const postDates = (item: SquarespaceRecord): {published?: Date; modified?: Date} => {
    const published =
        dateUtils.parseDate(getText(item['wp:post_date_gmt'])) ??
        dateUtils.parseDate(getText(item.pubDate)) ??
        dateUtils.parseDate(getText(item['wp:post_date']));
    return {published, modified: dateUtils.parseDate(getText(item['wp:post_modified_gmt'])) ?? published};
};

/** Plain text of `html`, cut back to whole words when it is longer than `max` characters. */
export const htmlToTextTrimmed = (html: string, max: number): string => {
    const noHtml = html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\r?\n|\r/g, ' ')
        .replace(/ {2,}/, ' ')
        .trim();
    return noHtml && noHtml.length > max ? noHtml.slice(0, max).split(' ').slice(0, -1).join(' ') : noHtml;
};

/** A post slug from its Squarespace link: the last path segment without `.html`; drafts can link to `/null`. */
export const postSlug = (link: string): string => {
    const slug = link
        .replace(/(\.html)/i, '')
        .split('/')
        .pop();
    return !slug || slug.includes('null') ? 'untitled' : slug;
};

/**
 * The author a `wp:author` record describes. The slug comes from the login, or else the display name; a missing
 * display name comes from the slug, and a missing email becomes `<slug>@example.com`.
 */
export const processUser = (user: SquarespaceRecord): SquarespaceUser => {
    const login = getText(user['wp:author_login']);
    const name = getText(user['wp:author_display_name']);
    const slug = slugify(login) || slugify(name) || 'author';
    const email = getText(user['wp:author_email']);
    return {
        login,
        data: {
            slug,
            name: name || stringUtils.startCase(slug),
            email: email.length ? email : `${slug}@example.com`
        }
    };
};

/** An item's categories, followed by its tags when `fetchTags` is set. */
export const processTags = (categories: SquarespaceRecord[], fetchTags: boolean): SquarespaceTag[] => {
    const tag = (taxonomy: SquarespaceRecord): SquarespaceTag => ({
        url: `/tag/${taxonomy['@_nicename']}`,
        data: {slug: taxonomy['@_nicename'], name: getText(taxonomy)}
    });
    return [
        ...categories.filter(taxonomy => taxonomy['@_domain'] === 'category').map(tag),
        ...(fetchTags ? categories.filter(taxonomy => taxonomy['@_domain'] === 'post_tag').map(tag) : [])
    ];
};

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz', '.ico', '.webp'];

/** An attachment's URL when it is an image that can be a feature image. */
export const featureImageUrl = (attachment: SquarespaceRecord | undefined): string | undefined => {
    const url = getText(attachment?.['wp:attachment_url']);
    if (!url) {
        return undefined;
    }
    const host = URL.parse(url)?.hostname ?? '';
    return IMAGE_EXTENSIONS.includes(extname(url)) || host === 'images.unsplash.com' ? url : undefined;
};

/** Convert Squarespace block HTML into HTML Ghost's importer understands. */
export const processContent = (html: string | null | undefined, options: ContentOptions = {}): string => {
    if (!html) {
        return '';
    }

    return domUtils.processFragment(html, parsed => {
        if (options.removeSelectors) {
            parsed.$(options.removeSelectors).forEach(el => {
                el.remove();
            });
        }

        parsed.$('.sqs-audio-embed').forEach(el => {
            const cardOpts = {
                env: {dom: new SimpleDom.Document()},
                payload: {
                    src: el.getAttribute('data-url'),
                    title: el.getAttribute('data-title')
                }
            };

            domUtils.replaceWith(el, audioCard.render(cardOpts).nodeValue!);
        });

        parsed.$('.newsletter-form-wrapper').forEach(el => {
            el.remove();
        });

        // squarespace images without src
        parsed.$('img[data-src]').forEach(img => {
            const src = img.getAttribute('data-src')!;
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
                img.setAttribute('src', src);
            }
        });

        parsed.$('figure blockquote').forEach(el => {
            const nextSibling = el.nextElementSibling;
            // Rebuild as `<blockquote><p>…original…<br><br>…caption…</p></blockquote>`
            // using DOM node moves rather than assigning a serialized string to
            // innerHTML, so DOM-sourced text is never reparsed as HTML.
            const p = parsed.document.createElement('p');
            p.append(...el.childNodes);
            if (nextSibling && nextSibling.tagName === 'FIGCAPTION') {
                p.append(
                    parsed.document.createElement('br'),
                    parsed.document.createElement('br'),
                    ...nextSibling.childNodes
                );
                nextSibling.remove();
            }
            el.append(p);
        });

        parsed.$('.sqs-video-wrapper').forEach(el => {
            const theHtml = decode(el.getAttribute('data-html'));
            const parent = el.closest('.embed-block-wrapper')?.parentElement;

            if (parent) {
                domUtils.replaceWith(parent, `<figure class="kg-card kg-embed-card">${theHtml}</figure>`);
            }
        });

        // TODO: this should be a parser plugin
        // Wrap nested lists in HTML card
        parsed.$('ul li ul, ol li ol, ol li ul, ul li ol').forEach(nestedList => {
            // Walk up to the nearest parent ul/ol (equivalent to parentsUntil('ul, ol').parent())
            const topList = nestedList.parentElement!.closest('ul, ol');
            domUtils.insertBefore(topList, '<!--kg-card-begin: html-->');
            domUtils.insertAfter(topList, '<!--kg-card-end: html-->');
        });

        return parsed.html().trim();
    });
};
