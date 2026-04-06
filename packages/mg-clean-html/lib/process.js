import {domUtils} from '@tryghost/mg-utils';
import styleToObject from 'style-to-object';
import escapeStringRegexp from 'escape-string-regexp';

const {serializeChildren, replaceWith, parents, isComment, getCommentData, insertBefore, insertAfter} = domUtils;

const isAllowed = (el) => {
    if (el.classList.contains('instagram-media')) {
        return false;
    }

    if (parents(el, '.instagram-media').length) {
        return false;
    }

    return true;
};

const changeTagName = (doc, el, newTag) => {
    const newEl = doc.createElement(newTag);
    for (const attr of el.attributes) {
        newEl.setAttribute(attr.name, attr.value);
    }
    newEl.innerHTML = el.innerHTML;
    replaceWith(el, newEl);
    return newEl;
};

const cleanHTML = (args) => {
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

                let styleAttr = el.getAttribute('style');
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

                let styleAttr = el.getAttribute('style');
                let styles = styleToObject(styleAttr);
                let fontWeight = styles['font-weight'];
                let weightlessStyleAttr = styleAttr.replace(/font-weight: ?([a-zA-Z0-9-]+);?/, '');

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

                let styleAttr = el.getAttribute('style');
                let styles = styleToObject(styleAttr);
                let fontWeight = styles['font-weight'];

                let weightlessStyleAttr = styleAttr.replace(/font-weight: ?([a-zA-Z0-9-]+);?/, '');
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

                let styleAttr = el.getAttribute('style');
                let styles = styleToObject(styleAttr);
                let fontStyle = styles['font-style'];
                let stylelessStyleAttr = styleAttr.replace(/font-style: ?([a-zA-Z0-9-]+);?/, '');

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

                let styleAttr = el.getAttribute('style');
                let styles = styleToObject(styleAttr);
                let fontStyle = styles['font-style'];

                let stylelessStyleAttr = styleAttr.replace(/font-style: ?([a-zA-Z0-9-]+);?/, '');
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

                let styleAttr = el.getAttribute('style');
                let styles = styleToObject(styleAttr);
                let color = styles?.color ?? false;

                if (!color) {
                    return;
                }

                let theReg = new RegExp(`color: ?${escapeStringRegexp(color)};?`);
                let colorlessStyleAttr = styleAttr.replace(theReg, '');

                el.setAttribute('style', colorlessStyleAttr);
            });
        }

        // Remove background declarations
        if (opinionated) {
            parsed.$('[style*="background"]').forEach((el) => {
                if (!isAllowed(el)) {
                    return;
                }

                let styleAttr = el.getAttribute('style');
                let styles = styleToObject(styleAttr);

                let background = styles.background ?? false;
                if (background) {
                    styleAttr = styleAttr.replace(new RegExp(`background: ?${escapeStringRegexp(background)};?`), '');
                }

                let backgroundAttachment = styles['background-attachment'] ?? false;
                if (backgroundAttachment) {
                    styleAttr = styleAttr.replace(new RegExp(`background-attachment: ?${escapeStringRegexp(backgroundAttachment)};?`), '');
                }

                let backgroundClip = styles['background-clip'] ?? false;
                if (backgroundClip) {
                    styleAttr = styleAttr.replace(new RegExp(`background-clip: ?${escapeStringRegexp(backgroundClip)};?`), '');
                }

                let backgroundColor = styles['background-color'] ?? false;
                if (backgroundColor) {
                    styleAttr = styleAttr.replace(new RegExp(`background-color: ?${escapeStringRegexp(backgroundColor)};?`), '');
                }

                let backgroundImage = styles['background-image'] ?? false;
                if (backgroundImage) {
                    styleAttr = styleAttr.replace(new RegExp(`background-image: ?${escapeStringRegexp(backgroundImage)};?`), '');
                }

                let backgroundOrigin = styles['background-origin'] ?? false;
                if (backgroundOrigin) {
                    styleAttr = styleAttr.replace(new RegExp(`background-origin: ?${escapeStringRegexp(backgroundOrigin)};?`), '');
                }

                let backgroundPosition = styles['background-position'] ?? false;
                if (backgroundPosition) {
                    styleAttr = styleAttr.replace(new RegExp(`background-position: ?${escapeStringRegexp(backgroundPosition)};?`), '');
                }

                let backgroundRepeat = styles['background-repeat'] ?? false;
                if (backgroundRepeat) {
                    styleAttr = styleAttr.replace(new RegExp(`background-repeat: ?${escapeStringRegexp(backgroundRepeat)};?`), '');
                }

                let backgroundSize = styles['background-size'] ?? false;
                if (backgroundSize) {
                    styleAttr = styleAttr.replace(new RegExp(`background-size: ?${escapeStringRegexp(backgroundSize)};?`), '');
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

                let styleAttr = el.getAttribute('style').trim();

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

                let hasStyle = outermost.getAttribute('style') ? true : false;
                let hasType = outermost.getAttribute('type') || outermost.querySelectorAll('[type]').length ? true : false;
                let hasValue = outermost.getAttribute('value') || outermost.querySelectorAll('[value]').length ? true : false;
                let hasStart = outermost.getAttribute('start') || outermost.querySelectorAll('[start]').length ? true : false;
                let hasOLList = outermost.querySelectorAll('ol').length ? true : false;
                let hasULList = outermost.querySelectorAll('ul').length ? true : false;

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
