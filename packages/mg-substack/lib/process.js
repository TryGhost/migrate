const fs = require('fs').promises;
const path = require('path');
const $ = require('cheerio');
const url = require('url');
const errors = require('@tryghost/errors');
const SimpleDom = require('simple-dom');
const audioCard = require('@tryghost/kg-default-cards/lib/cards/audio');

const getFiles = async (filePath) => {
    let filenames = await fs.readdir(filePath);

    return filenames.filter(filename => filename.match(/\.html/));
};

const readContent = async (filePath) => {
    return fs.readFile(filePath, 'utf-8');
};

const readFiles = async (files, postsDir) => {
    const postContent = {};
    for (const file of files) {
        const substackId = file.replace(/\.html/, '');

        postContent[substackId] = await readContent(path.join(postsDir, file));
    }

    return postContent;
};

const getUnsizedImageName = (str) => {
    const noSizeRegex = /(.*)(_[0-9]{1,4}x[0-9]{1,4}.[a-z]{2,4})/gmi;
    let srcParts = str.split(/\/|%2F/);
    let last = srcParts.slice(-1)[0];
    let matches = noSizeRegex.exec(last);

    return matches[1];
};

const processContent = (post, siteUrl, options) => {
    const {substackPodcastURL, metaData} = post;
    const responseData = metaData?.responseData || {};

    let html = post.data.html;

    // If there's no HTML, exit & return an empty string to avoid errors
    if (!html) {
        return '';
    }

    // As there is HTML, pass it to Cheerio inside a `<body>` tag so we have a global wrapper to target later on
    const $html = $.load(`<body>${html}</body>`, {
        decodeEntities: false
    });

    // We use the `'og:image` as the feature image. If the first item in the content is an image and is the same as the `og:image`, remove it
    if (responseData?.og_image) {
        let firstElement = $html('body *').first();

        if (firstElement.tagName === 'img' || $(firstElement).find('img').length) {
            let theElementItself = (firstElement.tagName === 'img') ? firstElement : $(firstElement).find('img');

            let firstImgSrc = $(theElementItself).attr('src');
            let unsizedFirstSrc = getUnsizedImageName(firstImgSrc);

            let ogImgSrc = responseData.og_image;
            let unsizedOgSrc = getUnsizedImageName(ogImgSrc);

            if (unsizedFirstSrc === unsizedOgSrc) {
                if ($(firstElement).find('figcaption').length) {
                    post.data.feature_image_caption = $(firstElement).find('figcaption').html();
                }

                $(firstElement).remove();
            }
        }
    }

    // If we have a podcast URL, embed an audio card at the start of the document
    if (substackPodcastURL) {
        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: substackPodcastURL,
                title: post.data.title
            }
        };

        const buildCard = audioCard.render(cardOpts);
        const cardHTML = buildCard.nodeValue;

        $html('body').prepend(cardHTML);
    }

    $html('div.tweet').each((i, el) => {
        let src = $(el).children('a').attr('href');
        let parsed = url.parse(src);

        if (parsed.search) {
            // remove possible query params
            parsed.search = null;
        }
        src = url.format(parsed, {search: false});

        let $figure = $('<figure class="kg-card kg-embed-card"></figure>');
        let $blockquote = $('<blockquote class="twitter-tweet"></blockquote>');
        let $anchor = $(`<a href="${src}"></a>`);
        let $script = $('<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>');

        $blockquote.append($anchor);

        $figure.append($blockquote);
        $figure.append($script);

        $(el).replaceWith($figure);
    });

    $html('.captioned-image-container').each((i, div) => {
        const hasCaption = $(div).find('figcaption').length;

        $(div).find('a').removeAttr('class');

        $(div).find('img').removeAttr('data-attrs');
        $(div).find('img').removeAttr('srcset');
        $(div).find('img').removeAttr('width');
        $(div).find('img').removeAttr('height');
        $(div).find('img').addClass('kg-image');

        $(div).find('figure').addClass('kg-card kg-image-card');

        if (hasCaption) {
            $(div).find('figure').addClass('kg-card-hascaption');
        }

        $(div).replaceWith($(div).find('figure'));
    });

    $html('a > style').each((i, style) => {
        $(style).remove();
    });

    $html('ul, ol').each((i, list) => {
        if ($(list).find('img, div, figure, blockquote').length) {
            $(list).before('<!--kg-card-begin: html-->');
            $(list).after('<!--kg-card-end: html-->');
        }
    });

    // Remove Substack share buttons
    $html('p.button-wrapper').each((i, button) => {
        let shareLinks = $(button).children('a.button');
        if (shareLinks.length === 1 && siteUrl) {
            let shareLink = $(shareLinks).get(0);
            let src = $(shareLink).attr('href');
            let parsed = url.parse(src);

            // If it's a share button, there's no use for it and completely remove the button
            if (parsed.search && parsed.search.indexOf('action=share') >= 0) {
                $(button).remove();
                return;
            }

            // If it's a gift button, there's no use for it and completely remove the button
            if (parsed.search && parsed.search.indexOf('gift=true') >= 0) {
                $(button).remove();
                return;
            }
        }
    });

    // Update button elements
    $html('p.button-wrapper').each((i, button) => {
        let buttons = $(button).children('a.button');
        if (buttons.length === 1 && siteUrl) {
            let siteRegex = new RegExp(`^(?:${siteUrl}(?:\\/?)(?:p\\/)?)([a-zA-Z-_\\d]*)(?:\\/?)`, 'gi');
            let buttonLink = $(buttons).get(0);
            let buttonHref = $(buttonLink).attr('href');
            let buttonText = $(buttonLink).text();
            let parsed = url.parse(buttonHref);

            // remove possible query params
            parsed.search = null;

            buttonHref = url.format(parsed, {search: false});

            if (buttonHref.match(siteRegex)) {
                buttonHref = buttonHref.replace(siteRegex, '/$1/');
            }

            if (buttonHref === '/subscribe/') {
                buttonHref = options.subscribeLink || '#/portal/signup';
            }

            if (buttonHref.endsWith('/comments')) {
                buttonHref = options.commentLink || '#ghost-comments-root';
            }

            $(button).replaceWith(`<div class="kg-card kg-button-card kg-align-center"><a href="${buttonHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
        }
    });

    // TODO: this should be a parser plugin
    // Wrap nested lists in HTML card
    $html('ul li ul, ol li ol, ol li ul, ul li ol').each((i, nestedList) => {
        let $parent = $(nestedList).parentsUntil('ul, ol').parent();
        $parent.before('<!--kg-card-begin: html-->');
        $parent.after('<!--kg-card-end: html-->');
    });

    // Handle footnotes
    let footnotesMarkup = $(`<div class="footnotes"><hr><ol></ol></div>`);
    let footnotesCount = 0;
    $html('.footnote').each((i, el) => {
        let footnoteBodyAnchor = $(el).find('a').attr('href');
        let footnoteID = $(el).attr('id');
        let footnoteNumber = parseInt(footnoteID);
        let footnoteContent = $(el).find('.footnote-content');

        footnoteContent.find('p').last().append(` <a href="${footnoteBodyAnchor}" title="Jump back to footnote ${footnoteNumber} in the text.">↩</a>`);
        footnotesMarkup.find('ol').append(`<li id="${footnoteID}">${footnoteContent.html()}</li>`);
        $(el).remove();

        footnotesCount = footnotesCount + 1;
    });

    if (footnotesCount > 0) {
        // Only append notes markup is there are footnotes
        $html('body').append(`<!--kg-card-begin: html-->${footnotesMarkup}<!--kg-card-end: html-->`);
    }

    // Wrap content that has footnote anchors in HTML tags to retain the footnote jump anchor
    $html('p, ul, ol').each((i, el) => {
        if ($(el).find('a.footnote-anchor').length > 0) {
            $(el).before('<!--kg-card-begin: html-->');
            $(el).after('<!--kg-card-end: html-->');
        }
    });

    // Replace any subscribe link on the same domain with a specific link
    if (options.subscribeLink) {
        $html('a').each((i, anchor) => {
            let href = $(anchor).attr('href');
            let linkRegex = new RegExp(`^(${siteUrl})?(/subscribe)(.*)`, 'gi');

            let matches = href.replace(linkRegex, '$2');

            if (matches === '/subscribe') {
                $(anchor).attr('href', options.subscribeLink);
            }
        });
    }

    // Replace any signup forms with a Portal signup button
    if (options.subscribeLink) {
        $html('.subscription-widget-wrap').each((i, div) => {
            const hasForm = $(div).find('form');

            if (hasForm.length) {
                const buttonText = $(div).find('form input[type="submit"]').attr('value');
                $(div).replaceWith(`<div class="kg-card kg-button-card kg-align-center"><a href="__GHOST_URL__/${options.subscribeLink}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
            }
        });
    }

    $html('.embedded-post-wrap').each((i, div) => {
        let bookmarkJSON = JSON.parse($(div).attr('data-attrs').replace(/&quot;/gm, '"'));

        let bookmarkLink = bookmarkJSON.url;
        let bookmarkPubName = bookmarkJSON.publication_name;
        let bookmarkPubIcon = bookmarkJSON.publication_logo_url;
        let bookmarkTitle = bookmarkJSON.title;
        let bookmarkContent = bookmarkJSON.truncated_body_text;

        let $bookmark = $('<figure class="kg-card kg-bookmark-card"></figure>');
        let $link = $(`<a class="kg-bookmark-container" href="${bookmarkLink}"></a>`);
        let $content = $(`<div class="kg-bookmark-content"><div class="kg-bookmark-title">${bookmarkTitle}</div><div class="kg-bookmark-description">${bookmarkContent}</div><div class="kg-bookmark-metadata"><img class="kg-bookmark-icon" src="${bookmarkPubIcon}"><span class="kg-bookmark-author">${bookmarkPubName}</span></div></div>`);

        $link.append($content);
        $bookmark.append($link);

        $(div).replaceWith($bookmark);
        $bookmark.before('<!--kg-card-begin: html-->');
        $bookmark.after('<!--kg-card-end: html-->');
    });

    // convert HTML back to a string
    html = $html('body').html();

    // Apply our new HTML back to the post object
    post.data.html = html.trim();

    return post;
};

const processPost = (post, siteUrl, options) => {
    post = processContent(post, siteUrl, options);

    return post;
};

module.exports = async (input, ctx) => {
    let {postsDir, options} = ctx;
    let {url: siteUrl} = options;
    const output = {};

    if (postsDir) {
        try {
            let postFiles = await getFiles(postsDir);
            let postContent = await readFiles(postFiles, postsDir);

            input.posts.map((post) => { // eslint-disable-line array-callback-return
                post.data.html = postContent[post.substackId];
            });
        } catch (error) {
            return new errors.InternalServerError({message: 'Couldn\'t read post files'});
        }
    }

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map((post) => {
            return processPost(post, siteUrl, options);
        });
    }

    return output;
};

module.exports.processContent = processContent;