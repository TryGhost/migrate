import $ from 'cheerio';
import sanitizeHtml from 'sanitize-html';
import SimpleDom from 'simple-dom';
import imageCard from '@tryghost/kg-default-cards/lib/cards/image.js';
import embedCard from '@tryghost/kg-default-cards/lib/cards/embed.js';

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

    const $allHtml: any = $.load(html, {
        xmlMode: true,
        decodeEntities: false
    });

    const $html: any = $.load($allHtml('#content-blocks').html(), {
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

    // Remove hidden elements
    $html('[style*="display:none"]').remove();
    $html('[style*="display: none"]').remove();

    // Remove the share links at the top
    $html('table.mob-block').remove();

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

    // Convert '...' to <hr />
    $html('p').each((i: any, el: any) => {
        const text = $html(el).text().trim();

        if (text === '...' || text === '…' || text === '&hellip;') {
            $html(el).replaceWith('<hr />');
        }
    });

    $html('a[href*="youtube.com"], a[href*="youtu.be"]').each((i: any, el: any) => {
        const imageCount = $html(el).find('img').length;
        const hasPlayIcon = $html(el).find('img[src*="youtube_play_icon.png"]').length;
        const hasThumbnail = $html(el).find('img[src*="i.ytimg.com/vi"]').length;
        const src = $html(el).attr('href');
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
        const parentTable = $html(el).parent().parent().parent();

        const theSrc = $html(el).attr('src');
        let theAlt = $html(el).attr('alt');

        const secondTr = ($(parentTable).find('tr').eq(1).find('p').length) ? $(parentTable).find('tr').eq(1).find('p') : false;
        const theText = $(secondTr)?.html()?.trim() ?? false;

        if (!theAlt) {
            theAlt = $(secondTr)?.text()?.trim();
        }

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: theSrc,
                alt: theAlt,
                caption: theText
            }
        };

        $(parentTable).replaceWith(serializer.serialize(imageCard.render(cardOpts)));
    });

    // Convert buttons to Ghost buttons
    $html('a[style="color:#FFFFFF;font-size:18px;padding:0px 14px;text-decoration:none;"]').each((i: any, el: any) => {
        const buttonText = $html(el).text();
        const buttonHref = $html(el).attr('href');
        $(el).replaceWith(`<div class="kg-card kg-button-card kg-align-center"><a href="${buttonHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
    });

    if (options?.url && options?.subscribeLink) {
        $html(`a[href^="${options.url}/subscribe"]`).each((i: any, el: any) => {
            $html(el).attr('href', options.subscribeLink);
            $html(el).removeAttr('target');
            $html(el).removeAttr('rel');
        });
    }

    // Get the cleaned HTML
    let bodyHtml = $html.html();

    // Pass the cleaned HTML through the sanitizer to only include specific elements
    const sanitizedHtml = sanitizeHtml(bodyHtml, {
        allowedTags: [
            'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'blockquote',
            'figure', 'figcaption', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'div', 'hr', 'iframe'
        ],
        allowedAttributes: {
            a: ['href', 'title', 'rel', 'target', 'class'],
            img: ['src', 'alt', 'title'],
            iframe: ['width', 'height', 'src', 'title', 'frameborder', 'allow', 'allowfullscreen'],
            figure: ['class'],
            div: ['class']
        },
        allowedClasses: {
            a: ['kg-btn', 'kg-btn-accent'],
            div: ['kg-card', 'kg-button-card', 'kg-align-center', 'kg-card-hascaption']
        }
    });

    return sanitizedHtml.trim();
};

const removeDuplicateFeatureImage = ({html, featureSrc}: {html: string, featureSrc: string}) => {
    let $html = $.load(html, {
        xmlMode: true,
        decodeEntities: false
    });

    let firstElement = $html('*').first();

    if (($(firstElement).get(0) && $(firstElement).get(0).name === 'img') || $(firstElement).find('img').length) {
        let theElementItself = $(firstElement).get(0).name === 'img' ? firstElement : $(firstElement).find('img');
        let firstImgSrc: any = $(theElementItself).attr('src');

        if (featureSrc.length > 0 && firstImgSrc) {
            let normalizedFirstSrc = firstImgSrc.replace('fit=scale-down,format=auto,onerror=redirect,quality=80', 'quality=100');

            if (featureSrc === normalizedFirstSrc) {
                $(theElementItself).remove();
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
