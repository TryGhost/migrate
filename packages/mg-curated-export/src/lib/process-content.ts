import {domUtils, stringUtils} from '@tryghost/mg-utils';
import type {CuratedIssue, CuratedItem} from './types.js';

/** The path an item's image is served from in Ghost, or `null` to leave the image out. */
export type ImageSource = (filename: string) => string | null;

const {escapeHTML} = stringUtils;

/** The item's image, as an image card linking to the item's URL when it has one. */
function imageHtml(item: CuratedItem, imageSource: ImageSource): string {
    const src = item.image_original_filename ? imageSource(item.image_original_filename) : null;
    if (!src) {
        return '';
    }
    const image = `src="${escapeHTML(src)}" alt="${escapeHTML(item.title ?? '')}"`;
    if (item.url) {
        return `<!--kg-card-begin: html--><a class="kg-card kg-image-card" href="${escapeHTML(item.url)}"><img class="kg-image" ${image} /></a><!--kg-card-end: html-->`;
    }
    return `<img ${image} />`;
}

/** A `Text` item: its image, title, description and footer text. */
function textItemHtml(item: CuratedItem, imageSource: ImageSource): string {
    const footer = domUtils.processFragment(item.footer ?? '', parsed => parsed.text());
    return [
        imageHtml(item, imageSource),
        `<h3>${item.title}</h3>`,
        item.description,
        `<p><i>${escapeHTML(footer)}</i></p>`
    ].join('');
}

/** A `Link` item: its image, linked title, description and linked domain. */
function linkItemHtml(item: CuratedItem, imageSource: ImageSource): string {
    const href = escapeHTML(item.url ?? '');
    return [
        imageHtml(item, imageSource),
        `<h3><a href="${href}">${item.title}</a></h3>`,
        item.description,
        `<p><i><a href="${href}">${item.url_domain}</a></i></p>`
    ].join('');
}

/**
 * An issue's HTML: each category's name as a heading, followed by its `Text` and `Link` items separated by rules.
 * Other item types are left out. `imageSource` gives the path of each item's image file.
 */
export default function processContent(issue: CuratedIssue, imageSource: ImageSource): string {
    const html: string[] = [];
    for (const category of issue.categories ?? []) {
        html.push(`<h2>${category.name}</h2>`);
        for (const [index, item] of (category.items ?? []).entries()) {
            if (index) {
                html.push('<hr>');
            }
            if (item.type === 'Text') {
                html.push(textItemHtml(item, imageSource));
            } else if (item.type === 'Link') {
                html.push(linkItemHtml(item, imageSource));
            }
        }
    }
    return html.join('');
}
