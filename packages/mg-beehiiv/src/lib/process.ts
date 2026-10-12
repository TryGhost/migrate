import sanitizeHtml from 'sanitize-html';
import SimpleDom from 'simple-dom';
import {domUtils, youtubeUtils, cardUtils} from '@tryghost/mg-utils';

const {parseFragment, serializeChildren, replaceWith, attr, parents} = domUtils;
const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);
const {getYouTubeID} = youtubeUtils;
const imageCard = cardUtils.getCard('image');
const embedCard = cardUtils.getCard('embed');
const bookmarkCard = cardUtils.getCard('bookmark');

const getAncestor = (el: Element, levels: number) => {
    let current = el;

    for (let level = 0; level < levels; level += 1) {
        current = current.parentElement!;
    }

    return current;
};

const isURL = (urlString: string | undefined) => {
    if (!urlString) {
        return false;
    }

    try {
        new URL(urlString);
        return true;
    } catch (err) {
        return false;
    }
};

const processHTML = ({
    html,
    postData,
    allData,
    options
}: {
    html: string;
    postData?: mappedDataObject;
    allData?: any;
    options?: any;
}) => {
    // First, clean up the email HTML to remove bits we don't want or change up

    // Let's do some regexp magic to remove some beehiiv variables
    // https://support.beehiiv.com/hc/en-us/articles/7606088263191
    html = html.replace(/{{subscriber_id}}/g, '#');
    html = html.replace(/{{rp_refer_url}}/g, '#');
    html = html.replace(/{{rp_refer_url_no_params}}/g, '#');
    html = html.replace(/<figure([^>]*)\/>/gi, '<figure$1></figure>');

    const allParsed = parseFragment(html);
    const contentBlocks = allParsed.$('#content-blocks')[0];

    if (!contentBlocks) {
        return '';
    }

    const parsed = parseFragment(serializeChildren(contentBlocks.parentElement!));

    if (options?.url) {
        parsed.$('a').forEach(el => {
            const theHref = attr(el, 'href');
            const isHrefURL = isURL(theHref);

            if (theHref && isHrefURL) {
                const url = new URL(theHref);

                const params = new URLSearchParams(url.search);

                params.delete('utm_source');
                params.delete('utm_medium');
                params.delete('utm_campaign');
                params.delete('last_resource_guid');

                url.search = params.toString();

                attr(el, 'href', url.toString());
            }
        });
    }

    // Polls
    parsed.$('td.e').forEach(el => {
        el.remove();
    });

    // Find <p> tag which contains {{rp_personalized_text}} and remove the parent table or the paragraph itself
    parsed.$('p').forEach(el => {
        if (!el.textContent!.includes('{{rp_personalized_text}}')) {
            return;
        }

        const parentTable = parents(el, 'table')[0];
        (parentTable || el).remove();
    });

    parsed
        .$('h1 strong, h1 b, h2 strong, h2 b, h3 strong, h3 b, h4 strong, h4 b, h5 strong, h5 b, h6 strong, h6 b')
        .forEach(el => {
            replaceWith(el, serializeChildren(el).trim());
        });

    parsed.$('table.j').forEach(el => {
        const td = parsed.$('td', el)[0];
        const tdContent = serializeChildren(td).trim();

        if (tdContent === '&nbsp;') {
            replaceWith(el, '<hr>');
        }
    });

    parsed.$('td[align="center"] > table.d3[align="center"]').forEach(el => {
        const parent = el.parentElement!;
        const text = el
            .textContent!.replace(/(\r\n|\n|\r|&nbsp;)/gm, ' ')
            .replace(/(\s{2,})/gm, ' ')
            .trim();
        replaceWith(
            parent,
            `<div class="kg-card kg-quote-card kg-align-center"><blockquote class="kg-blockquote"><p>${text}</p></blockquote></div>`
        );
    });

    // Galleries
    parsed.$('table.mob-w-full').forEach(el => {
        let allImages: string[] = [];

        parsed.$('td.mob-stack', el).forEach(ell => {
            const img = parsed.$('img', ell)[0];
            const pText = parsed
                .$('p', ell)
                .map(paragraph => paragraph.textContent!)
                .join('')
                .trim();

            let cardOpts: any = {
                env: {dom: new SimpleDom.Document()},
                payload: {
                    src: attr(img, 'src'),
                    alt: attr(img, 'alt')
                }
            };

            if (pText && pText.length > 0) {
                cardOpts.payload.caption = pText;
            }

            const link = parents(img, 'a')[0];

            if (link) {
                cardOpts.payload.href = attr(link, 'href');
            }

            allImages.push(serializer.serialize(imageCard.render(cardOpts)));
        });

        replaceWith(el, allImages.join(''));
    });

    // Embeds
    parsed.$('td.embed-img.mob-stack').forEach(el => {
        const parent = el.parentElement!.parentElement!;

        const href = attr(parsed.$('a', parent)[0], 'href');
        const image = attr(parsed.$('img', parent)[0], 'src');
        const paragraphs = parsed.$('p', parent);
        const title = paragraphs[0]!.textContent!;
        const description = paragraphs[1]!.textContent!;

        const parentTable = getAncestor(parent, 5);

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

        replaceWith(parentTable, serializer.serialize(bookmarkCard.render(cardOpts)));
    });

    // Remove hidden elements
    parsed.$('[style*="display:none"], [style*="display: none"]').forEach(el => el.remove());

    // Remove the share links at the top
    parsed.$('table.mob-block').forEach(el => el.remove());

    // Remove sponsor blocks
    parsed.$('table.rec__content').forEach(el => el.remove());

    // Remove the open tracking pixel element
    parsed.$('div[data-open-tracking="true"]').forEach(el => {
        if (el.textContent!.includes('{{OPEN_TRACKING_PIXEL}}')) {
            el.remove();
        }
    });

    parsed.$('img[src="{{rp_next_milestone_image_url}}"]').forEach(el => el.remove());
    parsed.$('a[href="{{rp_referral_hub_url}}"]').forEach(el => el.remove());

    // Remove unsubscribe links, social links, & email footer
    parsed.$('td.b').forEach(el => el.remove());

    // Remove the 'Read online' link
    parsed.$('td.f').forEach(el => el.remove());

    // Remove the post title container, otherwise it would be a duplicate
    if (postData?.data?.title) {
        parsed.$('h1').forEach(el => {
            if (!el.textContent!.includes(postData.data.title)) {
                return;
            }

            let titleContainer = el.parentElement;

            while (titleContainer?.parentElement && titleContainer.parentElement.tagName !== 'TABLE') {
                titleContainer = titleContainer.parentElement;
            }

            titleContainer?.remove();
        });
    }

    // Remove cells that only contain a non-breaking space
    parsed.$('td').forEach(el => {
        const text = serializeChildren(el).trim();

        if (text === '&nbsp;') {
            el.remove();
        }
    });

    // Convert '...' to <hr />
    parsed.$('p').forEach(el => {
        const text = el.textContent!.trim();

        if (text === '...' || text === '…' || text === '&hellip;') {
            replaceWith(el, '<hr />');
        }
    });

    // Convert linked YouTube thumbnails to embeds
    parsed.$('a[href*="youtube.com"], a[href*="youtu.be"]').forEach(el => {
        const imageCount = parsed.$('img', el).length;
        const hasPlayIcon = parsed.$('img[src*="youtube_play_icon.png"]', el).length;
        const hasThumbnail = parsed.$('img[src*="i.ytimg.com/vi"]', el).length;
        const src = attr(el, 'href');
        const caption = parsed.$('p', el)[0];
        const captionText = caption?.textContent?.trim() || false;
        const captionHtml = caption ? serializeChildren(caption).trim() : false;

        if (imageCount === 2 && hasPlayIcon && hasThumbnail && src) {
            const videoID = getYouTubeID(src);

            let cardOpts: any = {
                env: {dom: new SimpleDom.Document()},
                payload: {
                    caption: null,
                    html: `<iframe src="https://www.youtube.com/embed/${videoID}?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" width="160" height="90"></iframe>`
                }
            };

            if (captionText && captionText.length > 0) {
                cardOpts.payload.caption = captionHtml;
            }

            replaceWith(el, serializer.serialize(embedCard.render(cardOpts)));
        }
    });

    parsed.$('img').forEach(el => {
        // Skip if the image is in a figure
        const isInFigure = parents(el, 'figure').length;
        if (isInFigure) {
            return;
        }

        const parentTable = getAncestor(el, 3);

        const theSrc = attr(el, 'src');
        let theAlt = attr(el, 'alt');

        const secondTr = parsed.$('tr', parentTable)[1];
        const caption = secondTr ? parsed.$('p', secondTr)[0] : null;
        const theText = caption ? serializeChildren(caption).trim() : false;

        if (!theAlt) {
            theAlt = caption?.textContent?.trim();
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
        const link = parents(el, 'a')[0];

        if (link) {
            cardOpts.payload.href = attr(link, 'href');
        }

        replaceWith(parentTable, serializer.serialize(imageCard.render(cardOpts)));
    });

    // Convert buttons to Ghost buttons
    parsed.$('a[style="color:#FFFFFF;font-size:18px;padding:0px 14px;text-decoration:none;"]').forEach(el => {
        const buttonText = el.textContent!;
        const buttonHref = attr(el, 'href');
        replaceWith(
            el,
            `<div class="kg-card kg-button-card kg-align-center"><a href="${buttonHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`
        );
    });

    if (options?.url && options?.subscribeLink) {
        parsed.$(`a[href^="${options.url}/subscribe"]`).forEach(el => {
            attr(el, 'href', options.subscribeLink);
            el.removeAttribute('target');
            el.removeAttribute('rel');
        });
    }

    if (options?.url && options?.comments && options?.commentLink) {
        parsed.$('a[href*="comments=true"]').forEach(el => {
            const href = attr(el, 'href');

            if (href?.includes(options.url)) {
                attr(el, 'href', options.commentLink);
                el.removeAttribute('target');
                el.removeAttribute('rel');
            }
        });
    } else if (options?.url && options?.comments === false) {
        parsed.$('a[href*="comments=true"]').forEach(el => {
            const href = attr(el, 'href');

            if (href?.includes(options.url)) {
                el.remove();
            }
        });
    }

    // Remove empty tags
    parsed.$('p, figure').forEach(el => {
        const elementHtml = serializeChildren(el).trim();

        if (elementHtml === '') {
            el.remove();
        }
    });

    // Get the cleaned HTML
    let bodyHtml = parsed.html();

    // Pass the cleaned HTML through the sanitizer to only include specific elements
    const sanitizedHtml = sanitizeHtml(bodyHtml, {
        allowedTags: [
            'b',
            'i',
            'em',
            'strong',
            'a',
            'p',
            'br',
            'ul',
            'ol',
            'li',
            'blockquote',
            'figure',
            'figcaption',
            'img',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'div',
            'hr',
            'iframe',
            'span'
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

const removeDuplicateFeatureImage = ({html, featureSrc}: {html: string; featureSrc: string}) => {
    const parsed = parseFragment(html);
    const firstElement = parsed.body.firstElementChild;
    const firstImage = firstElement?.tagName === 'IMG' ? firstElement : parsed.$('img', firstElement || undefined)[0];

    if (firstImage) {
        const firstImgSrc = attr(firstImage, 'src') as string;

        // Both images usually end in the same way, so we can split the URL and compare the last part
        const firstImageSplit = firstImgSrc.split('/uploads/asset/');
        const featureImageSplit = featureSrc.split('/uploads/asset/');

        if (firstImageSplit[1] === featureImageSplit[1]) {
            firstImage.remove();
        }

        if (featureSrc.length > 0 && firstImgSrc) {
            let normalizedFirstSrc = firstImgSrc.replace(
                'fit=scale-down,format=auto,onerror=redirect,quality=80',
                'quality=100'
            );

            if (featureSrc === normalizedFirstSrc) {
                firstImage.remove();
            }
        }
    }

    return parsed.html();
};

export {getYouTubeID, processHTML, removeDuplicateFeatureImage};
