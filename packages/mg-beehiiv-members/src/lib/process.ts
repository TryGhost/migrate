import fsUtils from '@tryghost/mg-fs-utils';

type memberObject = {
    email: string;
    name: string | null;
    note: string | null;
    subscribed_to_emails: boolean;
    stripe_customer_id: string;
    complimentary_plan: boolean;
    labels: string[] | null;
    created_at: Date;
};

const processCsv = async ({csvPath}: {csvPath: string}) => {
    const csvData = await fsUtils.csv.parseCSV(csvPath);

    const newObj: memberObject[] = [];

    csvData.forEach((member: any) => {
        const createdAt = new Date(member.created_at);

        let newMember: memberObject = {
            email: member.email,
            name: null,
            note: null,
            subscribed_to_emails: false,
            stripe_customer_id: '',
            complimentary_plan: false,
            labels: [],
            created_at: createdAt
        };

        if (member.status === 'active') {
            newMember.subscribed_to_emails = true;
        }

        if (member.tier === 'premium') {
            newMember.stripe_customer_id = 'auto';
        }

        if (newMember.labels) {
            newMember.labels.push(`beehiiv-status-${member.status}`);
            newMember.labels.push(`beehiiv-tier-${member.tier}`);
        }

        newObj.push(newMember);
    });

    return newObj;
};

export {
    processCsv
};

// import $ from 'cheerio';
// import sanitizeHtml from 'sanitize-html';

// const getYouTubeID = (url: string) => {
//     const arr = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
//     return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
// };

// const processHTML = ({html, postData, options}: {html: string, postData?: mappedDataObject, options: any}) => {
//     // First, clean up the email HTML to remove bits we don't want or change up

//     // Let's do some regexp magic to remove some beehiiv variables
//     // https://support.beehiiv.com/hc/en-us/articles/7606088263191
//     html = html.replace(/{{subscriber_id}}/g, '#');
//     html = html.replace(/{{rp_refer_url}}/g, '#');

//     let $html = $.load(html, {
//         xmlMode: true,
//         decodeEntities: false
//     });

//     // Remove hidden elements
//     $html('[style*="display:none"]').remove();
//     $html('[style*="display: none"]').remove();

//     // Remove the share links at the top
//     $html('table.mob-block').remove();

//     // Remove the open tracking pixel element
//     $html('div[data-open-tracking="true"]:contains("{{OPEN_TRACKING_PIXEL}}")').remove();

//     $html('p:contains("{{rp_personalized_text}}")').remove();
//     $html('img[src="{{rp_next_milestone_image_url}}"]').remove();
//     $html(`a[href="{{rp_referral_hub_url}}"]`).remove();

//     // Remove unsubscribe links, social links, & email footer
//     $html('td.b').remove();

//     // Remove the 'Read online' link
//     $html('td.f').remove();

//     // Remove the post title container, otherwise it would be a duplicate
//     if (postData?.data?.title) {
//         $html(`h1:contains("${postData.data.title}")`).parentsUntil('table').remove();
//     }

//     // Convert '...' to <hr />
//     $html('p').each((i, el) => {
//         const text = $html(el).text().trim();
//         if (text === '...' || text === '…' || text === '&hellip;') {
//             $html(el).replaceWith('<hr />');
//         }
//     });

//     $html('a[href*="youtube.com"]').each((i, el) => {
//         const imageCount = $html(el).find('img').length;
//         const hasPlayIcon = $html(el).find('img[src*="youtube_play_icon.png"]').length;
//         const hasThumbnail = $html(el).find('img[src*="i.ytimg.com/vi"]').length;
//         const src = $html(el).attr('href');
//         const captionText = $html(el).find('p')?.text()?.trim() || false;
//         const captionHtml = $html(el).find('p')?.html()?.trim() || false;

//         if (imageCount === 2 && hasPlayIcon && hasThumbnail && src) {
//             const videoID = getYouTubeID(src);

//             const $figure = $(`<figure></figure>`);
//             $figure.addClass('kg-card kg-embed-card');

//             const $figcaption = $(`<figcaption></figcaption>`);
//             const $iframe = $(`<iframe src="https://www.youtube.com/embed/${videoID}?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen=""></iframe>`);

//             $figure.append($iframe);

//             if (captionText && captionText.length > 0) {
//                 $iframe.attr('title', captionText);
//             }

//             if (captionHtml) {
//                 $figure.addClass('kg-card-hascaption');
//                 $figcaption.html(captionHtml);
//                 $figure.append($figcaption);
//             }

//             $html(el).replaceWith($figure);
//         }
//     });

//     if (options?.url && options?.subscribeLink) {
//         $html(`a[href^="${options.url}/subscribe"]`).each((i, el) => {
//             $html(el).attr('href', options.subscribeLink);
//             $html(el).removeAttr('target');
//             $html(el).removeAttr('rel');
//         });
//     }

//     // Get the cleaned HTML
//     const bodyHtml = $html('body').html();

//     // Pass the cleaned HTML through the sanitizer to only include specific elements
//     const sanitizedHtml = sanitizeHtml(bodyHtml, {
//         allowedTags: [
//             'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'blockquote',
//             'figure', 'figcaption', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
//             'div', 'hr', 'iframe'
//         ],
//         allowedAttributes: {
//             a: ['href', 'title', 'rel', 'target'],
//             img: ['src', 'alt', 'title'],
//             iframe: ['width', 'height', 'src', 'title', 'frameborder', 'allow', 'allowfullscreen'],
//             figure: ['class']
//         }
//     });

//     return sanitizedHtml.trim();
// };

// const removeDuplicateFeatureImage = ({html, featureSrc}: {html: string, featureSrc: string}) => {
//     let $html = $.load(html, {
//         xmlMode: true,
//         decodeEntities: false
//     });

//     let firstElement = $html('*').first();

//     if (($(firstElement).get(0) && $(firstElement).get(0).name === 'img') || $(firstElement).find('img').length) {
//         let theElementItself = $(firstElement).get(0).name === 'img' ? firstElement : $(firstElement).find('img');
//         let firstImgSrc: any = $(theElementItself).attr('src');

//         if (featureSrc.length > 0 && firstImgSrc) {
//             let normalizedFirstSrc = firstImgSrc.replace('fit=scale-down,format=auto,onerror=redirect,quality=80', 'quality=100');

//             if (featureSrc === normalizedFirstSrc) {
//                 $(theElementItself).remove();
//             }
//         }
//     }

//     return $html.html();
// };

// export {
//     getYouTubeID,
//     processHTML,
//     removeDuplicateFeatureImage
// };
