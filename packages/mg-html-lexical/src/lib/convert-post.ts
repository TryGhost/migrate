import converter from '@tryghost/kg-html-to-lexical';
import errors from '@tryghost/errors';
import {convertToHTMLCard} from './convert-to-html-card.js';

export type postOptions = {
    title: string;
    slug: string;
    lexical?: string;
    html?: string;
}

const convertPost = (post: postOptions, htmlCard = false, logger?: any) => { // TODO: Add type for `logger` when available
    if (typeof post.html === 'undefined' || !post.html || post.html === 'undefined') {
        throw new errors.InternalServerError({message: 'Post has no html field to convert'});
    }

    if (htmlCard) {
        post.lexical = JSON.stringify(convertToHTMLCard(post.html));
        logger.warn({
            message: `Post converted to HTML Card "${post.title}"`,
            src: post.slug,
            reference: post.title,
            html: post.html
        });
    } else {
        post.lexical = JSON.stringify(converter.htmlToLexical(post.html));
    }

    delete post.html;
};

export {
    convertPost
};
