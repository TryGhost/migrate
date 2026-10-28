import {domUtils, cardUtils, xmlUtils} from '@tryghost/mg-utils';
import {slugify, stripInvisibleChars} from '@tryghost/string';
import SimpleDom from 'simple-dom';
import type {LibsynChannel, LibsynItem, XmlValue} from './types.js';

const {ensureArray, getText} = xmlUtils;
const {serializeChildren, replaceWith, insertBefore, insertAfter, isComment, getCommentData} = domUtils;
const audioCard = cardUtils.getCard('audio');

export interface ContentOptions {
    /** Use Libsyn's embedded player. When `false`, or when the item has no Libsyn ID, use a Ghost audio card. Defaults to `true`. */
    useEmbed?: boolean;
    /** The audio card's cover when the item has no `itunes:image`, such as the feed's image. */
    image?: string;
}

export interface ProcessOptions extends ContentOptions {
    /** A tag added to every post, before its other tags. */
    addTag?: string | null;
    /** Feed categories added to every post, after `addTag`. */
    categories?: string[];
    /** Add the item's `itunes:keywords` as tags. Defaults to `true`. */
    useItemKeywords?: boolean;
}

export interface LibsynTag {
    name: string;
    slug: string;
}

export interface ProcessedPost {
    /** The item's title, or its `itunes:title`. */
    title: string;
    /** The slugified title, which is also the last segment of the episode's URL on the Libsyn site. */
    slug: string;
    html: string;
    /** `addTag`, the categories, the item's keywords and `#libsyn`, one per slug, public tags first. */
    tags: LibsynTag[];
}

export interface ProcessedChannel {
    /** The feed owner, or `itunes:author`, who writes every post. `null` when the feed names neither. */
    author: {name: string; email: string | null} | null;
    /** Each iTunes category followed by its subcategories. */
    categories: string[];
    /** The feed's `itunes:image`, or its `<image>` URL. */
    image: string;
}

/** A child or `@_` attribute of a parsed XML element, or of the first of a repeated element. */
export function getChild(value: XmlValue | undefined, name: string): XmlValue | undefined {
    if (Array.isArray(value)) {
        return getChild(value[0], name);
    }
    return typeof value === 'object' ? value[name] : undefined;
}

/** The text of an element's attribute. */
export const getAttribute = (value: XmlValue | undefined, name: string): string =>
    getText(getChild(value, `@_${name}`));

const escapeAttribute = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** RFC 2822 zone names, in hours from UTC. Single-letter military zones other than `Z` are unknown and read as UTC. */
const ZONES: Record<string, number> = {
    ut: 0,
    gmt: 0,
    est: -5,
    edt: -4,
    cst: -6,
    cdt: -5,
    mst: -7,
    mdt: -6,
    pst: -8,
    pdt: -7
};

const RFC_2822 =
    /^(?:[a-z]{3},\s*)?(\d{1,2})\s+([a-z]{3})\s+(\d{4}|\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s+([+-]\d{4}|[a-z]+))?$/i;

/** A zone's offset from UTC in minutes, or `NaN` when it is unknown. */
function zoneOffset(zone: string): number {
    if (/^[+-]\d{4}$/.test(zone)) {
        const minutes = Number(zone.slice(3));
        return minutes < 60 ? (zone.startsWith('-') ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + minutes) : NaN;
    }
    return zone.length === 1 ? 0 : (ZONES[zone.toLowerCase()] ?? NaN) * 60;
}

/**
 * An RFC 2822 date, such as `Mon, 10 Aug 2020 07:00:00 +0000`, or `null` when it is missing or invalid. The day name
 * is ignored, two-digit years are 1950–2049, and a date without a zone is read as UTC.
 */
export function parseDate(value: string): Date | null {
    const match = RFC_2822.exec(value.trim());
    if (!match) {
        return null;
    }
    const [, dayText, monthName, yearText, hourText, minuteText, secondText = '0', zone = '+0000'] = match;
    const [day, hour, minute, second] = [dayText, hourText, minuteText, secondText].map(Number);
    const month = MONTHS.indexOf(monthName.toLowerCase());
    const year = Number(yearText) + (yearText.length === 2 ? (Number(yearText) < 50 ? 2000 : 1900) : 0);
    const offset = zoneOffset(zone);
    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    if (Number.isNaN(offset) || month < 0 || hour > 23 || minute > 59 || second > 60 || date.getUTCDate() !== day) {
        return null;
    }
    return new Date(date.getTime() - offset * 60_000);
}

/** `hh:mm:ss` or `mm:ss` as seconds, and a plain number as whole minutes. Missing or invalid durations are 0. */
export function durationToSeconds(duration: string): number {
    const parts = duration.trim().split(':');
    if (parts.length > 3 || !parts.every(part => /^\d+$/.test(part))) {
        return 0;
    }
    if (parts.length === 1) {
        return Number(parts[0]) * 60;
    }
    return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/**
 * The HTML of one episode: Libsyn's embedded player (or a Ghost audio card) followed by the item's description, with
 * empty paragraphs removed, `font-weight: 400` spans unwrapped, and nested lists wrapped in HTML cards.
 */
export function processContent(item: LibsynItem, {useEmbed = true, image = ''}: ContentOptions = {}): string {
    const title = getText(item.title);
    const id = getText(item['libsyn:itemId']).trim();

    let player: string;
    if (useEmbed && id) {
        player = `<!--kg-card-begin: html--><iframe id="embed_${escapeAttribute(id)}" title="${escapeAttribute(title)}" style="border: none" src="//html5-player.libsyn.com/embed/episode/id/${escapeAttribute(id)}/custom-color/000000/" height="90" width="100%" scrolling="no" allowfullscreen="" webkitallowfullscreen="" mozallowfullscreen="" oallowfullscreen="" msallowfullscreen=""></iframe><!--kg-card-end: html-->`;
    } else {
        const card = audioCard.render({
            env: {dom: new SimpleDom.Document()},
            payload: {
                thumbnailSrc: getAttribute(item['itunes:image'], 'href') || image,
                src: getText(item.link).trim() || getAttribute(item.enclosure, 'url'),
                title,
                duration: durationToSeconds(getText(item['itunes:duration']))
            }
        });
        player = card.nodeValue as string;
    }

    const notes = getText(item.description) || getText(item['content:encoded']);

    const html = domUtils.processFragment(`${player}${notes}`, parsed => {
        for (const el of parsed.$('p')) {
            const content = serializeChildren(el).trim();

            if (stripInvisibleChars(content).length === 0 || content === '&nbsp;') {
                el.remove();
            }
        }

        for (const el of parsed.$('span[style="font-weight: 400;"]')) {
            replaceWith(el, serializeChildren(el).trim());
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

        // Convert HTML back to a string
        return parsed.html();
    });

    return html.trim();
}

/** A tag for a name, or `null` when the name has no slug. `#` names are internal tags with a `hash-` slug. */
function namedTag(value: string): LibsynTag | null {
    const name = value.trim();
    const internal = name.startsWith('#');
    const slug = slugify(internal ? name.slice(1) : name);
    return slug ? {name, slug: internal ? `hash-${slug}` : slug} : null;
}

/** The title, slug, HTML and tags of one episode. */
export function processPost(item: LibsynItem, options: ProcessOptions = {}): ProcessedPost {
    const title = getText(item.title).trim() || getText(item['itunes:title']).trim();
    const tags = new Map<string, LibsynTag>();
    const add = (value: string) => {
        const tag = namedTag(value);
        if (tag && !tags.has(tag.slug)) {
            tags.set(tag.slug, tag);
        }
    };

    if (options.addTag) {
        add(options.addTag);
    }
    for (const category of options.categories ?? []) {
        add(category);
    }
    if (options.useItemKeywords ?? true) {
        for (const keyword of getText(item['itunes:keywords']).split(',')) {
            add(keyword);
        }
    }
    add('#libsyn');

    return {
        title,
        slug: slugify(title),
        html: processContent(item, options),
        tags: [...tags.values()].sort((a, b) => Number(a.name.startsWith('#')) - Number(b.name.startsWith('#')))
    };
}

/** The author, categories and image that a feed's channel gives every post. */
export function processChannel(channel: LibsynChannel): ProcessedChannel {
    const owner = channel['itunes:owner'];
    const name = getText(getChild(owner, 'itunes:name')).trim() || getText(channel['itunes:author']).trim();
    const email = getText(getChild(owner, 'itunes:email')).trim();

    const categories: string[] = [];
    for (const category of ensureArray(channel['itunes:category'])) {
        categories.push(getAttribute(category, 'text'));
        for (const subcategory of ensureArray(getChild(category, 'itunes:category'))) {
            categories.push(getAttribute(subcategory, 'text'));
        }
    }

    return {
        author: name ? {name, email: email || null} : null,
        categories: categories.filter(Boolean),
        image: getAttribute(channel['itunes:image'], 'href') || getText(getChild(channel.image, 'url'))
    };
}
