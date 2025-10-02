import * as cheerio from 'cheerio';
import sanitizeHtml from 'sanitize-html';
import SimpleDom from 'simple-dom';
import imageCard from '@tryghost/kg-default-cards/lib/cards/image.js';
import embedCard from '@tryghost/kg-default-cards/lib/cards/embed.js';
import bookmarkCard from '@tryghost/kg-default-cards/lib/cards/bookmark.js';

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);

const getYouTubeID = (url: string) => {
    const arr = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
    return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
};

const isURL = (urlString: string | undefined) => {
    if (undefined === urlString) {
        return false;
    }

    try {
        new URL(urlString);
        return true;
    } catch (err) {
        return false;
    }
};

const processHTML = ({html, postData, allData, options}: {html: string, postData?: mappedDataObject, allData?: any, options?: any}) => {
    // First, clean up the email HTML to remove bits we don't want or change up

    // Let's do some regexp magic to remove some beehiiv variables
    // https://support.beehiiv.com/hc/en-us/articles/7606088263191
    html = html.replace(/{{subscriber_id}}/g, '#');
    html = html.replace(/{{rp_refer_url}}/g, '#');
    html = html.replace(/{{rp_refer_url_no_params}}/g, '#');

    const $allHtml: any = cheerio.load(html, {
        xmlMode: true,
        decodeEntities: false
    });

    const $html: any = cheerio.load($allHtml('#content-blocks').html(), {
        xmlMode: true,
        decodeEntities: false
    });

    if (options?.url) {
        $html('a').each((i: any, el: any) => {
            const theHref = $html(el).attr('href');
            const isHrefURL = isURL(theHref);

            if (theHref && isHrefURL) {
                const url = new URL(theHref);

                const params = new URLSearchParams(url.search);

                params.delete('utm_source');
                params.delete('utm_medium');
                params.delete('utm_campaign');
                params.delete('last_resource_guid');

                url.search = params.toString();

                $html(el).attr('href', url.toString());
            }
        });
    }

    // Polls
    $html('td[class="e"], td[class="ee e "]').each((i: any, el: any) => {
        $html(el).remove();
    });

    // FInd <p> tag which contains {{rp_personalized_text}} and find the parent table to remove the whole section
    $html('p:contains("{{rp_personalized_text}}")').each((i: any, el: any) => {
        const parentTable = $html(el).parents('table').first();
        $html(parentTable).remove();
    });

    $html('h1 strong, h1 b, h2 strong, h2 b, h3 strong, h3 b, h4 strong, h4 b, h5 strong, h5 b, h6 strong, h6 b').each((i: any, el: any) => {
        const text = $html(el).html().trim();
        $html(el).replaceWith(text);
    });

    $html('table.j').each((i: any, el: any) => {
        const tdContent = $html(el).find('td').html().trim();

        if (tdContent === '&nbsp;') {
            $html(el).replaceWith('<hr>');
        }
    });

    $html('table.d3[align="center"]').each((i: any, el: any) => {
        const parent = $html(el).parent('td[align="center"]');
        const text = $html(el).text().replace(/(\r\n|\n|\r|&nbsp;)/gm, ' ').replace(/(\s{2,})/gm, ' ').trim();
        $html(parent).replaceWith(`<div class="kg-card kg-quote-card kg-align-center"><blockquote class="kg-blockquote"><p>${text}</p></blockquote></div>`);
    });

    // Galleries
    $html('table.mob-w-full').each((i: any, el: any) => {
        let allImages: string[] = [];

        $html(el).find('td.mob-stack').each((ii: any, ell: any) => {
            const img = $html(ell).find('img');
            const pText = $html(ell).find('p').text().trim();

            let cardOpts: any = {
                env: {dom: new SimpleDom.Document()},
                payload: {
                    src: img.attr('src'),
                    alt: img.attr('alt')
                }
            };

            if (pText && pText.length > 0) {
                cardOpts.payload.caption = pText;
            }

            const isInLink = $html(img).parents('a').length;

            if (isInLink) {
                cardOpts.payload.href = $html(img).parents('a').attr('href');
            }

            allImages.push(serializer.serialize(imageCard.render(cardOpts)));
        });

        $html(el).replaceWith(allImages.join(''));
    });

    // Embeds
    $html('td.embed-img.mob-stack').each((i: any, el: any) => {
        const parent = $html(el).parent().parent();

        const href = $html(parent).find('a').attr('href');
        const image = $html(parent).find('img').attr('src');
        const title = $html(parent).find('p').eq(0).text();
        const description = $html(parent).find('p').eq(1).text();

        const parentTable = $html(parent).parent().parent().parent().parent().parent();

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                url: href,
                metadata: {
                    url: href,
                    title: title,
                    description: description,
                    icon: null,
                    thumbnail: image,
                    publisher: null,
                    author: null
                },
                caption: null
            }
        };

        $html(parentTable).replaceWith(serializer.serialize(bookmarkCard.render(cardOpts)));
    });

    // Remove hidden elements
    $html('[style*="display:none"]').remove();
    $html('[style*="display: none"]').remove();

    // Remove the share links at the top
    $html('table.mob-block').remove();

    // Remove sponsor blocks
    $html('table.rec__content').remove();

    // Remove the open tracking pixel element
    $html('div[data-open-tracking="true"]:contains("{{OPEN_TRACKING_PIXEL}}")').remove();

    $html('p:contains("{{rp_personalized_text}}")').remove();
    $html('img[src="{{rp_next_milestone_image_url}}"]').remove();
    $html(`a[href="{{rp_referral_hub_url}}"]`).remove();

    // Remove unsubscribe links, social links, & email footer
    $html('td.b').remove();

    // Remove the 'Read online' link
    $html('td.f').remove();

    // Remove the post title container, otherwise it would be a duplicate
    if (postData?.data?.title) {
        $html(`h1:contains("${postData.data.title}")`).parentsUntil('table').remove();
    }

    // Remove cells that only contain a non-breaking space
    $html('td').each((i: any, el: any) => {
        const text = $html(el).html().trim();

        if (text === '&nbsp;') {
            $html(el).remove();
        }
    });

    // Convert '...' to <hr />
    $html('p').each((i: any, el: any) => {
        const text = $html(el).text().trim();

        if (text === '...' || text === '…' || text === '&hellip;') {
            $html(el).replaceWith('<hr />');
        }
    });

    // If the iframe has no inner HTML, add a non-breaking space so it doesn't get removed later
    // Case: There's a bug somewhere in the chain that causes iframes to become self-closing, and this prevents that.
    $html('iframe').each((i: any, el: any) => {
        const innerHtml = $html(el).html().length;

        if (innerHtml === 0) {
            $html(el).html('&nbsp;');
        }
    });

    // Convert linked YouTube thumbnails to embeds
    $html('a[href*="youtube.com"], a[href*="youtu.be"]').each((i: any, el: any) => {
        const imageCount = $html(el).find('img').length;
        const hasPlayIcon = $html(el).find('img[src*="youtube_play_icon.png"]').length;
        const hasThumbnail = $html(el).find('img[src*="i.ytimg.com/vi"]').length;
        const src = $html(el)?.attr('href');
        const captionText = $html(el).find('p')?.text()?.trim() || false;
        const captionHtml = $html(el).find('p')?.html()?.trim() || false;

        if (imageCount === 2 && hasPlayIcon && hasThumbnail && src) {
            const videoID = getYouTubeID(src);

            let cardOpts = {
                env: {dom: new SimpleDom.Document()},
                payload: {
                    caption: null,
                    html: `<iframe src="https://www.youtube.com/embed/${videoID}?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" width="160" height="90"></iframe>`
                }
            };

            if (captionText && captionText.length > 0) {
                cardOpts.payload.caption = captionHtml;
            }

            $html(el).replaceWith(serializer.serialize(embedCard.render(cardOpts)));
        }
    });

    $html('img').each((i: any, el: any) => {
        // Skip if the image is in a figure
        const isInFigure = $html(el).parents('figure').length;
        if (isInFigure) {
            return;
        }

        const parentTable = $html(el).parent().parent().parent();

        const theSrc = $html(el).attr('src');
        let theAlt = $html(el).attr('alt');

        const secondTr = ($html(parentTable).find('tr').eq(1).find('p').length) ? $html(parentTable).find('tr').eq(1).find('p') : false;
        const theText = $html(secondTr)?.html()?.trim() ?? false;

        if (!theAlt) {
            theAlt = $html(secondTr)?.text()?.trim();
        }

        let cardOpts: any = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: theSrc,
                alt: theAlt,
                caption: theText
            }
        };

        // Check if the parent element to this is a <a> tag
        const isInLink = $html(el).parents('a').length;

        if (isInLink) {
            cardOpts.payload.href = $html(el).parents('a').attr('href');
        }

        $html(parentTable).replaceWith(serializer.serialize(imageCard.render(cardOpts)));
    });

    // Convert buttons to Ghost buttons
    $html('a[style="color:#FFFFFF;font-size:18px;padding:0px 14px;text-decoration:none;"]').each((i: any, el: any) => {
        const buttonText = $html(el).text();
        const buttonHref = $html(el).attr('href');
        $html(el).replaceWith(`<div class="kg-card kg-button-card kg-align-center"><a href="${buttonHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
    });

    if (options?.url && options?.subscribeLink) {
        $html(`a[href^="${options.url}/subscribe"]`).each((i: any, el: any) => {
            $html(el).attr('href', options.subscribeLink);
            $html(el).removeAttr('target');
            $html(el).removeAttr('rel');
        });
    }

    if (options?.url && options?.comments && options?.commentLink) {
        $html('a[href*="comments=true"]').each((i: any, el: any) => {
            const href = $html(el).attr('href');

            if (href.includes(options.url)) {
                $html(el).attr('href', options.commentLink);
                $html(el).removeAttr('target');
                $html(el).removeAttr('rel');
            }
        });
    } else if (options?.url && options?.comments === false) {
        $html('a[href*="comments=true"]').each((i: any, el: any) => {
            const href = $html(el).attr('href');

            if (href.includes(options.url)) {
                $html(el).remove();
            }
        });
    }

    // Remove empty tags
    $html('p, figure').each((i: any, el: any) => {
        const elementHtml = $html(el).html().trim();

        if (elementHtml === '') {
            $html(el).remove();
        }
    });

    // Get the cleaned HTML
    let bodyHtml = $html.html({
        selfClosingTags: false
    });

    // return bodyHtml;

    // Pass the cleaned HTML through the sanitizer to only include specific elements
    const sanitizedHtml = sanitizeHtml(bodyHtml, {
        allowedTags: [
            'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'blockquote',
            'figure', 'figcaption', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'div', 'hr', 'iframe', 'span'
        ],
        allowedAttributes: {
            a: ['href', 'title', 'rel', 'target', 'class'],
            img: ['src', 'alt', 'title', 'class', 'width', 'height'],
            iframe: ['width', 'height', 'src', 'title', 'frameborder', 'allow', 'allowfullscreen'],
            figure: ['class'],
            div: ['class']
        },
        allowedClasses: {
            '*': ['kg-*']
        }
    });

    return sanitizedHtml.trim();
};

const removeDuplicateFeatureImage = ({html, featureSrc}: {html: string, featureSrc: string}) => {
    let $html = cheerio.load(html, {
        xmlMode: true,
        decodeEntities: false
    });

    let firstElement = $html('*').first();

    if (($html(firstElement).get(0) && $html(firstElement).get(0).name === 'img') || $html(firstElement).find('img').length) {
        let theElementItself = $html(firstElement).get(0).name === 'img' ? firstElement : $html(firstElement).find('img');
        let firstImgSrc: any = $html(theElementItself).attr('src');

        // Both images usually end in the same way, so we can split the URL and compare the last part
        const firstImageSplit = firstImgSrc.split('/uploads/asset/');
        const featureImageSplit = featureSrc.split('/uploads/asset/');

        if (firstImageSplit[1] === featureImageSplit[1]) {
            $html(theElementItself).remove();
        }

        if (featureSrc.length > 0 && firstImgSrc) {
            let normalizedFirstSrc = firstImgSrc.replace('fit=scale-down,format=auto,onerror=redirect,quality=80', 'quality=100');

            if (featureSrc === normalizedFirstSrc) {
                $html(theElementItself).remove();
            }
        }
    }

    return $html.html();
};

export {
    getYouTubeID,
    processHTML,
    removeDuplicateFeatureImage
};
