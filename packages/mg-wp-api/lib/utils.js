import $ from 'cheerio';
import {htmlToText} from 'html-to-text';

const stripHtml = (html) => {
    // Remove HTML tags, new line characters, and trim white-space
    return html.replace(/<[^>]+>/g, '').replace(/\r?\n|\r/g, ' ').trim();
};

const getYouTubeID = (videoUrl) => {
    const arr = videoUrl.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
    return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
};

const wpCDNToLocal = (imgUrl) => {
    if (!imgUrl) {
        return imgUrl;
    }

    if (!imgUrl.match(/i[0-9]+.wp.com/g)) {
        return imgUrl;
    }

    imgUrl = imgUrl.replace(/i[0-9]+.wp.com\//, '');

    const newUrl = new URL(imgUrl);
    newUrl.searchParams.delete('resize');

    const updatedUrl = `${newUrl.origin}${newUrl.pathname}`;

    return updatedUrl;
};

const largerSrc = (imageSrc) => {
    if (!imageSrc) {
        return imageSrc;
    }

    let newSrc = imageSrc;

    const fileSizeRegExp = new RegExp('-([0-9]+x[0-9]+).([a-zA-Z]{2,4})$');
    const fileSizeMatches = imageSrc.match(fileSizeRegExp);

    if (fileSizeMatches) {
        newSrc = imageSrc.replace(fileSizeRegExp, '.$2');
    }

    return newSrc;
};

const processAuthor = (wpAuthor) => {
    let authorObject = {
        url: wpAuthor.link,
        data: {
            id: wpAuthor.id && wpAuthor.id,
            slug: wpAuthor.slug,
            name: wpAuthor.name,
            email: wpAuthor.email && wpAuthor.email
        }
    };

    if (wpAuthor?.description) {
        authorObject.data.bio = htmlToText(wpAuthor.description, {
            wordwrap: false
        });
    }

    let profileImage = wpAuthor.avatar_urls && wpAuthor.avatar_urls['96'];
    if (profileImage) {
        const imgUrl = new URL(profileImage);
        const params = new URLSearchParams(imgUrl.search);
        params.set('d', 'blank');
        params.set('r', 'g');
        params.set('s', '500');
        imgUrl.search = params.toString();
        authorObject.data.profile_image = imgUrl.href;
    }

    if (wpAuthor.url) {
        try {
            new URL(wpAuthor.url);
            authorObject.data.website = wpAuthor.url;
        } catch (error) {
            // Just silently fail
            // console.log(error);
        }
    }

    return authorObject;
};

const processAuthors = (authors) => {
    return authors.map(author => processAuthor(author));
};

const processTerm = (wpTerm) => {
    return {
        url: wpTerm.link,
        data: {
            slug: wpTerm.slug,
            name: htmlToText(wpTerm.name)
        }
    };
};

const processTerms = (wpTerms, fetchTags) => {
    let categories = [];
    let tags = [];

    wpTerms.forEach((taxonomy) => {
        taxonomy.forEach((term) => {
            if (term.taxonomy === 'category') {
                categories.push(processTerm(term));
            }

            if (fetchTags && term.taxonomy === 'post_tag') {
                tags.push(processTerm(term));
            }
        });
    });

    return categories.concat(tags);
};

// Sometimes, the custom excerpt can be part of the post content. If the flag with an selector for the
// custom excerpt class is passed, we use this one to populate the custom excerpt and remove it from the post content
const processExcerpt = (html, excerptSelector = false) => {
    if (!html) {
        return '';
    }

    let excerptText;

    // Set the text to convert to either be the supplied string or found text in the supplied HTML chunk
    if (excerptSelector) {
        // TODO: this should be possible by using a pseudo selector as a passed `excerptSelector`, e. g. `h2.excerpt:first-of-type`,
        const $html = $.load(html, {
            decodeEntities: false,
            scriptingEnabled: false
        }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

        excerptText = $html(excerptSelector).first().html();
    } else {
        excerptText = html;
    }

    // Clean up the given text to contain no HTML
    let excerpt = htmlToText(excerptText);

    // Combine lines & trim excess white space
    excerpt = excerpt.split('\n').join(' ').trim();

    // which is officially supported by the underlying css-select library, but not working.
    if (excerpt.length > 0) {
        return excerpt;
    } else {
        return null;
    }
};

export {
    stripHtml,
    getYouTubeID,
    wpCDNToLocal,
    largerSrc,
    processAuthor,
    processAuthors,
    processTerm,
    processTerms,
    processExcerpt
};
