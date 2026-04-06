import {domUtils} from '@tryghost/mg-utils';
// style-to-object's ESM types don't resolve correctly with NodeNext module resolution
// eslint-disable-next-line
import _styleToObject from 'style-to-object';
const styleToObject = _styleToObject as unknown as (style: string) => Record<string, string> | null;
import escapeStringRegexp from 'escape-string-regexp';

const {serializeChildren, replaceWith, parents, isComment, getCommentData, insertBefore, insertAfter} = domUtils;

interface CleanHTMLArgs {
    html?: string;
    opinionated?: boolean;
    cards?: boolean;
}

const isAllowed = (el: Element): boolean => {
    if (el.classList.contains('instagram-media')) {
        return false;
    }

    if (parents(el, '.instagram-media').length) {
        return false;
    }

    return true;
};

const changeTagName = (doc: Document, el: Element, newTag: string): Element => {
    const newEl = doc.createElement(newTag);
    for (const attr of Array.from(el.attributes)) {
        newEl.setAttribute(attr.name, attr.value);
    }
    newEl.innerHTML = el.innerHTML;
    replaceWith(el, newEl);
    return newEl;
};

const cleanHTML = (args?: CleanHTMLArgs): string => {
    let html = args?.html ?? '';
    const opinionated = args?.opinionated ?? false;
    const cards = args?.cards ?? false;

    // If there's nothing to process, return & exit early
    if (html === '') {
        return html;
    }

    return domUtils.processFragment(html, (parsed) => {
        // Remove left, center & right text alignment
        if (opinionated) {
            parsed.$('p[style*="text-align"], li[style*="text-align"]').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                let styleAttr = el.getAttribute('style') ?? '';
                styleAttr = styleAttr.replace(/text-align: ?(left|center|right);?/, '').trim();
                el.setAttribute('style', styleAttr);
            });
        }

        // Change inline font-weight to <b> tag or remove altogether
        if (opinionated) {
            parsed.$('span[style*="font-weight"]').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                const styleAttr = el.getAttribute('style') ?? '';
                const styles = styleToObject(styleAttr);
                const fontWeight = styles?.['font-weight'] ?? '';
                const weightlessStyleAttr = styleAttr.replace(/font-weight: ?([a-zA-Z0-9-]+);?/, '');

                if (parseInt(fontWeight) >= 600 || ['bold', 'bolder'].includes(fontWeight)) {
                    const newEl = changeTagName(parsed.document, el, 'b');
                    newEl.setAttribute('style', weightlessStyleAttr);
                } else {
                    el.setAttribute('style', weightlessStyleAttr);
                }
            });
        }

        if (opinionated) {
            parsed.$('a[style*="font-weight"], p[style*="font-weight"], li[style*="font-weight"]').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                const styleAttr = el.getAttribute('style') ?? '';
                const styles = styleToObject(styleAttr);
                const fontWeight = styles?.['font-weight'] ?? '';

                const weightlessStyleAttr = styleAttr.replace(/font-weight: ?([a-zA-Z0-9-]+);?/, '');
                el.setAttribute('style', weightlessStyleAttr);

                if (['bold', 'bolder'].includes(fontWeight) || parseInt(fontWeight) >= 600) {
                    el.innerHTML = `<b>${serializeChildren(el)}</b>`;
                }
            });
        }

        // Change inline font-style to <i> tag or remove altogether
        if (opinionated) {
            parsed.$('span[style*="font-style"]').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                const styleAttr = el.getAttribute('style') ?? '';
                const styles = styleToObject(styleAttr);
                const fontStyle = styles?.['font-style'] ?? '';
                const stylelessStyleAttr = styleAttr.replace(/font-style: ?([a-zA-Z0-9-]+);?/, '');

                if (['italic', 'oblique'].includes(fontStyle)) {
                    const newEl = changeTagName(parsed.document, el, 'i');
                    newEl.setAttribute('style', stylelessStyleAttr);
                } else {
                    el.setAttribute('style', stylelessStyleAttr);
                }
            });
        }

        if (opinionated) {
            parsed.$('a[style*="font-style"], p[style*="font-style"], li[style*="font-style"]').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                const styleAttr = el.getAttribute('style') ?? '';
                const styles = styleToObject(styleAttr);
                const fontStyle = styles?.['font-style'] ?? '';

                const stylelessStyleAttr = styleAttr.replace(/font-style: ?([a-zA-Z0-9-]+);?/, '');
                el.setAttribute('style', stylelessStyleAttr);

                if (['italic', 'oblique'].includes(fontStyle)) {
                    el.innerHTML = `<i>${serializeChildren(el)}</i>`;
                }
            });
        }

        // Remove text color declarations
        if (opinionated) {
            parsed.$('[style*="color"]').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                const styleAttr = el.getAttribute('style') ?? '';
                const styles = styleToObject(styleAttr);
                const color = styles?.color ?? false;

                if (!color) {
                    return;
                }

                const theReg = new RegExp(`color: ?${escapeStringRegexp(color)};?`);
                const colorlessStyleAttr = styleAttr.replace(theReg, '');

                el.setAttribute('style', colorlessStyleAttr);
            });
        }

        // Remove background declarations
        if (opinionated) {
            parsed.$('[style*="background"]').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                let styleAttr = el.getAttribute('style') ?? '';
                const styles = styleToObject(styleAttr);

                const bgProps = [
                    'background', 'background-attachment', 'background-clip',
                    'background-color', 'background-image', 'background-origin',
                    'background-position', 'background-repeat', 'background-size'
                ];

                for (const prop of bgProps) {
                    const val = styles?.[prop] ?? false;
                    if (val) {
                        styleAttr = styleAttr.replace(new RegExp(`${escapeStringRegexp(prop)}: ?${escapeStringRegexp(val)};?`), '');
                    }
                }

                el.setAttribute('style', styleAttr);
            });
        }

        // Remove empty `style=""` tags
        if (opinionated) {
            parsed.$('[style]').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                const styleAttr = (el.getAttribute('style') ?? '').trim();

                if (styleAttr.length === 0) {
                    el.removeAttribute('style');
                }
            });
        }

        // Remove formatting tags from headers
        if (opinionated) {
            parsed.$('h1, h2, h3, h4, h5, h6').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                el.querySelectorAll('*').forEach((ell) => {
                    if (['B', 'STRONG', 'I', 'EM', 'SPAN'].includes(ell.tagName)) {
                        replaceWith(ell, serializeChildren(ell));
                    }
                });

                // This could introduce extra spaces, so trim them
                let headerHTML = serializeChildren(el);
                let headerHTMLTrimmed = headerHTML.replace(/ {2,}/, '').trim();
                el.innerHTML = headerHTMLTrimmed;
            });
        }

        // Remove <p> & <li> tags, and remove leading or trailing <br>'s
        if (opinionated) {
            parsed.$('p, li').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                let content = serializeChildren(el).trim();
                content = content.replace(/^(<br ?\/?>){1,}|(<br ?\/?>){1,}$/gm, '');

                if (content.length === 0) {
                    el.remove();
                } else {
                    el.innerHTML = content;
                }
            });
        }

        // Wrap some lists in a HTML card
        if (cards) {
            parsed.$('ol, ul').forEach((ul) => {
                const outermost = domUtils.lastParent(ul, 'ul, ol') ?? ul;

                const hasStyle = !!outermost.getAttribute('style');
                const hasType = !!outermost.getAttribute('type') || !!outermost.querySelectorAll('[type]').length;
                const hasValue = !!outermost.getAttribute('value') || !!outermost.querySelectorAll('[value]').length;
                const hasStart = !!outermost.getAttribute('start') || !!outermost.querySelectorAll('[start]').length;
                const hasOLList = !!outermost.querySelectorAll('ol').length;
                const hasULList = !!outermost.querySelectorAll('ul').length;

                if (hasStyle || hasType || hasValue || hasStart || hasOLList || hasULList) {
                    // If parent is not wrapped in a HTML card, wrap it in one
                    const prev = outermost.previousSibling;
                    if (!isComment(prev) || getCommentData(prev) !== 'kg-card-begin: html') {
                        insertBefore(outermost, '<!--kg-card-begin: html-->');
                        insertAfter(outermost, '<!--kg-card-end: html-->');
                    }
                }
            });
        }

        // convert HTML back to a string
        html = parsed.html();

        // Remove empty attributes
        html = html.replace(/=""/g, '');

        return html;
    });
};

export {
    cleanHTML
};
