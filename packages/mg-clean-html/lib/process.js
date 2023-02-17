import $ from 'cheerio';
import styleToObject from 'style-to-object';
import escapeStringRegexp from 'escape-string-regexp';

$.prototype.unwrap = function () {
    this.replaceWith(this.html());
};

const isAllowed = (el) => {
    if ($(el).hasClass('instagram-media')) {
        return false;
    }

    if ($(el).parents('.instagram-media').length) {
        return false;
    }

    return true;
};

const cleanHTML = (args) => {
    let html = args?.html ?? '';
    const opinionated = args?.opinionated ?? false;
    const cards = args?.cards ?? false;

    const ignoreSelectors = [];
    ignoreSelectors.push('.instagram-media');

    // If there's nothing to process, return & exit early
    if (html === '') {
        return html;
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    // Remove left, center & right text alignment
    if (opinionated) {
        $html('p[style*="text-align"], li[style*="text-align"]').each((i, el) => {
            if (!isAllowed(el)) {
                return;
            }

            let styleAttr = $(el).attr('style');
            styleAttr = styleAttr.replace(/text-align: ?(left|center|right);?/, '').trim();
            $(el).attr('style', styleAttr);
        });
    }

    // Change inline font-weight to <b> tag or remove altogether
    if (opinionated) {
        $html('span[style*="font-weight"]').each((i, el) => {
            if (!isAllowed(el)) {
                return;
            }

            let styleAttr = $(el).attr('style');
            let styles = styleToObject(styleAttr);
            let fontWeight = styles['font-weight'];

            if (parseInt(fontWeight) >= 600) {
                el.tagName = 'b';
            } else if (['bold', 'bolder'].includes(fontWeight)) {
                el.tagName = 'b';
            }

            let weightlessStyleAttr = styleAttr.replace(/font-weight: ?([a-zA-Z0-9-]+);?/, '');
            $(el).attr('style', weightlessStyleAttr);
        });
    }

    if (opinionated) {
        $html('a[style*="font-weight"], p[style*="font-weight"], li[style*="font-weight"]').each((i, el) => {
            if (!isAllowed(el)) {
                return;
            }

            let styleAttr = $(el).attr('style');
            let styles = styleToObject(styleAttr);
            let fontWeight = styles['font-weight'];

            let weightlessStyleAttr = styleAttr.replace(/font-weight: ?([a-zA-Z0-9-]+);?/, '');
            $(el).attr('style', weightlessStyleAttr);

            if (['bold', 'bolder'].includes(fontWeight) || parseInt(fontWeight) >= 600) {
                $(el).html(`<b>${$(el).html()}</b>`);
            }
        });
    }

    // Change inline font-style to <b> tag or remove altogether
    if (opinionated) {
        $html('span[style*="font-style"]').each((i, el) => {
            if (!isAllowed(el)) {
                return;
            }

            let styleAttr = $(el).attr('style');
            let styles = styleToObject(styleAttr);
            let fontStyle = styles['font-style'];

            if (['italic', 'oblique'].includes(fontStyle)) {
                el.tagName = 'i';
            }

            let stylelessStyleAttr = styleAttr.replace(/font-style: ?([a-zA-Z0-9-]+);?/, '');
            $(el).attr('style', stylelessStyleAttr);
        });
    }

    if (opinionated) {
        $html('a[style*="font-style"], p[style*="font-style"], li[style*="font-style"]').each((i, el) => {
            if (!isAllowed(el)) {
                return;
            }

            let styleAttr = $(el).attr('style');
            let styles = styleToObject(styleAttr);
            let fontStyle = styles['font-style'];

            let stylelessStyleAttr = styleAttr.replace(/font-style: ?([a-zA-Z0-9-]+);?/, '');
            $(el).attr('style', stylelessStyleAttr);

            if (['italic', 'oblique'].includes(fontStyle)) {
                $(el).html(`<i>${$(el).html()}</i>`);
            }
        });
    }

    // Remove text color decelerations
    if (opinionated) {
        $html('[style*="color"]').each((i, el) => {
            if (!isAllowed(el)) {
                return;
            }

            let styleAttr = $(el).attr('style');
            let styles = styleToObject(styleAttr);
            let color = styles?.color ?? false;

            if (!color) {
                return;
            }

            let theReg = new RegExp(`color: ?${escapeStringRegexp(color)};?`);
            let colorlessStyleAttr = styleAttr.replace(theReg, '');

            $(el).attr('style', colorlessStyleAttr);
        });
    }

    // Remove background decelerations
    if (opinionated) {
        $html('[style*="background"]').each((i, el) => {
            if (!isAllowed(el)) {
                return;
            }

            let styleAttr = $(el).attr('style');
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

            $(el).attr('style', styleAttr);
        });
    }

    // Remove empty `style=""` tags
    if (opinionated) {
        $html('[style]').each((i, el) => {
            if (!isAllowed(el)) {
                return;
            }

            let styleAttr = $(el).attr('style').trim();
            let styleAttrLength = styleAttr.length;

            if (styleAttrLength === 0) {
                $(el).removeAttr('style');
            }
        });
    }

    // Remove formatting tags from headers
    if (opinionated) {
        $html('h1, h2, h3, h4, h5, h6').each((i, el) => {
            if (!isAllowed(el)) {
                return;
            }

            $(el).find('*').each((ii, ell) => {
                if (['b', 'strong', 'i', 'em', 'span'].includes(ell.tagName)) {
                    $(ell).unwrap();
                }
            });

            // THis could introduce extra spaces, so trim them
            let headerHTML = $(el).html();
            let headerHTMLTrimmed = headerHTML.replace(/ {2,}/, '').trim();
            $(el).html(headerHTMLTrimmed);
        });
    }

    // Remove <p> & <li> tags, and remove leading or trailing <br>'s
    if (opinionated) {
        $html('p, li').each((i, el) => {
            if (!isAllowed(el)) {
                return;
            }

            let content = $(el).html().trim();
            content = content.replace(/^(<br ?\/?>){1,}|(<br ?\/?>){1,}$/gm, '');

            if (content.length === 0) {
                $(el).remove();
            } else {
                $(el).html(content);
            }
        });
    }

    // Wrap some lists in a HTML card
    if (cards) {
        $html('ol, ul').each((i, ul) => {
            let $parent = ($(ul).parents('ul, ol').last().length) ? $(ul).parents('ul, ol').last() : $(ul);

            let hasStyle = ($($parent).attr('style')) ? true : false;
            let hasType = ($($parent).attr('type') || $($parent).find('[type]').length) ? true : false;
            let hasValue = ($($parent).attr('value') || $($parent).find('[value]').length) ? true : false;
            let hasStart = ($($parent).attr('start') || $($parent).find('[start]').length) ? true : false;
            let hasOLList = ($($parent).find('ol').length) ? true : false;
            let hasULList = ($($parent).find('ul').length) ? true : false;

            if (hasStyle || hasType || hasValue || hasStart || hasOLList || hasULList) {
                // If parent is not wrapped ina  HTML card, wrap it in one
                if ($parent.get(0)?.prev?.data !== 'kg-card-begin: html') {
                    $($parent).before('<!--kg-card-begin: html-->');
                    $($parent).after('<!--kg-card-end: html-->');
                }
            }
        });
    }

    // convert HTML back to a string
    html = $html.html();

    return html;
};

export {
    cleanHTML
};
