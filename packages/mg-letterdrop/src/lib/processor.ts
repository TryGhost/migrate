import {domUtils} from '@tryghost/mg-utils';
import {slugify} from '@tryghost/string';
import escapeStringRegexp from 'escape-string-regexp';
import type {LetterdropPost} from './types.js';

const {serializeChildren, replaceWith, insertBefore, insertAfter, isComment, getCommentData} = domUtils;

export interface ContentOptions {
    /** The live site's URL, without a trailing slash, such as `https://example.com`. */
    url: string;
    /** Where subscribe embeds and links to the site's plans, subscribe and promo pages point. */
    subscribeLink: string;
    /** The text of the buttons that replace subscribe embeds. */
    subscribeText: string;
}

export interface ProcessOptions extends ContentOptions {
    /** A tag added to every post as its primary tag. */
    addPrimaryTag?: string | null;
}

export interface LetterdropTag {
    name: string;
    slug: string;
}

export interface ProcessedPost {
    title: string;
    /** The post's slug, then the last segment of its URL, then its slugified title. Empty when none gives one. */
    slug: string;
    custom_excerpt: string | null;
    meta_title: string | null;
    meta_description: string | null;
    feature_image: string | null;
    html: string;
    /** `addPrimaryTag`, the post's tags and `#letterdrop`, one per slug, public tags first. */
    tags: LetterdropTag[];
    /** The author's trimmed name, or `null` when the post has none. */
    author: string | null;
}

/**
 * Clean the HTML of one Letterdrop post: internal `/c/` links become `/p/` links, nested lists are wrapped in HTML
 * cards, Quill images become figures, custom buttons become button cards (referral buttons are removed), subscribe
 * embeds become subscribe buttons, plain block quotes wrap their content in a paragraph, and links to the site's
 * plans, subscribe and promo pages point to `subscribeLink`.
 */
export function processContent(html: string | null | undefined, options: ContentOptions): string {
    // Drafts can have empty post bodies
    if (!html) {
        return '';
    }

    // Replace empty paragraphs & list items
    html = html.replace(/<p><br><\/p>/g, '');
    html = html.replace(/<li><br><\/li>/g, '');

    const site = escapeStringRegexp(options.url);
    const theDomain = options.url.replace(/(https?:\/\/)(www\.)?/, '');

    html = domUtils.processFragment(html, parsed => {
        // Letterdrop supplies internal links in post content with `.com/c/`, but post URLs in JSON are `.com/p/`.
        // Lets normalise that
        const internalLink = new RegExp(`${site}/c/`);
        for (const el of parsed.$('a[href]')) {
            el.setAttribute('href', el.getAttribute('href')!.replace(internalLink, `${options.url}/p/`));
        }

        // Wrap nested lists in HTML card
        for (const nestedList of parsed.$('ul li ul, ol li ol, ol li ul, ul li ol')) {
            // The selector only matches lists inside another list, so there is always an outermost one.
            const outermost = domUtils.lastParent(nestedList, 'ul, ol')!;

            // Don't double-wrap
            const prev = outermost.previousSibling;
            if (isComment(prev) && getCommentData(prev) === 'kg-card-begin: html') {
                continue;
            }

            insertBefore(outermost, '<!--kg-card-begin: html-->');
            insertAfter(outermost, '<!--kg-card-end: html-->');
        }

        for (const el of parsed.$('.quill-upload-image')) {
            const figure = el.querySelector('figure');

            if (figure) {
                replaceWith(el, figure);
                figure.removeAttribute('style');
                figure.querySelector('figcaption')?.removeAttribute('style');
            }
        }

        const referrals = new RegExp(`${site}/referrals/[a-zA-Z0-9]{24}`);
        for (const el of parsed.$('.letterdrop-custom-button')) {
            const a = el.querySelector('a');
            const aHref = a?.getAttribute('href') ?? '';

            if (referrals.test(aHref)) {
                el.remove();
            } else {
                const buttonText = a ? serializeChildren(a) : '';
                replaceWith(
                    el,
                    `<div class="kg-card kg-button-card kg-align-center"><a href="${aHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`
                );
            }
        }

        for (const el of parsed.$('iframe[name="letterdrop-subscribe-input"]')) {
            // Build the card from a static, input-free skeleton, then inject the
            // caller-supplied link and text via setAttribute/textContent so they are
            // escaped as an attribute value and text node rather than raw HTML.
            const tpl = parsed.document.createElement('template');
            tpl.innerHTML =
                '<div class="kg-card kg-button-card kg-align-center"><a href="" class="kg-btn kg-btn-accent"></a></div>';
            const card = tpl.content.firstElementChild!;
            const link = card.querySelector('a')!;
            link.setAttribute('href', options.subscribeLink);
            link.textContent = options.subscribeText;
            replaceWith(el, card);
        }

        for (const el of parsed.$('blockquote')) {
            if (!el.getAttribute('class')) {
                replaceWith(el, `<blockquote><p>${serializeChildren(el)}</p></blockquote>`);
            }
        }

        for (const el of parsed.$('a[href]')) {
            const href = el.getAttribute('href')!;

            if (
                href.includes(`${theDomain}/plans`) ||
                href.includes(`${theDomain}/subscribe`) ||
                href.includes(`${theDomain}/promo`)
            ) {
                el.setAttribute('href', options.subscribeLink);
            }
        }

        // Convert HTML back to a string
        return parsed.html();
    });

    return html.trim();
}

/** A tag for a name. `#` names are internal tags with a `hash-` slug. */
function namedTag(name: string): LetterdropTag {
    if (name.startsWith('#')) {
        return {name, slug: `hash-${slugify(name.slice(1)) || 'tag'}`};
    }
    return {name, slug: slugify(name) || 'tag'};
}

/** The slugified last path segment of a URL, or an empty string. */
function slugFromURL(url: unknown): string {
    const parsed = typeof url === 'string' ? URL.parse(url) : null;
    const segment = parsed?.pathname.split('/').filter(Boolean).pop() ?? '';
    try {
        return slugify(decodeURIComponent(segment));
    } catch {
        // A malformed escape sequence, such as `%zz`.
        return slugify(segment);
    }
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** The fields of one Letterdrop post, with its HTML cleaned by `processContent()`. Dates are left to the caller. */
export function processPost(data: LetterdropPost, options: ProcessOptions): ProcessedPost {
    const title = typeof data.title === 'string' ? data.title : '';

    const tags: LetterdropTag[] = [];
    const addPrimaryTag = options.addPrimaryTag?.trim();
    if (addPrimaryTag) {
        tags.push(namedTag(addPrimaryTag));
    }
    for (const tag of Array.isArray(data.tags) ? data.tags : []) {
        const name = typeof tag === 'string' ? tag.trim() : '';
        if (name) {
            tags.push(namedTag(name));
        }
    }
    tags.push({name: '#letterdrop', slug: 'hash-letterdrop'});
    const unique = tags.filter((tag, index) => tags.findIndex(other => other.slug === tag.slug) === index);

    return {
        title,
        slug: (typeof data.slug === 'string' && data.slug.trim()) || slugFromURL(data.url) || slugify(title),
        custom_excerpt: text(data.subtitle),
        meta_title: text(data.metaTitle),
        meta_description: text(data.metaDescription),
        feature_image: text(data.coverImage),
        html: processContent(data.body, options),
        // Public tags first, then internal (`#`) tags, keeping their order otherwise.
        tags: unique.sort((a, b) => Number(a.name.startsWith('#')) - Number(b.name.startsWith('#'))),
        author: text(data.author?.name)?.trim() ?? null
    };
}
