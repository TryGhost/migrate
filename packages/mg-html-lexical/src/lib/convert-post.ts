import {htmlToLexical} from '@tryghost/kg-html-to-lexical';
import errors from '@tryghost/errors';
import {convertToHTMLCard} from './convert-to-html-card.js';

export type postOptions = {
    title: string;
    slug: string;
    lexical?: string;
    html?: string;
}

const convertPost = (post: postOptions, htmlCard = false) => {
    if (typeof post.html === 'undefined' || post.html === 'undefined') {
        throw new errors.InternalServerError({message: 'Post has no html field to convert'});
    }

    post.html = post.html.trim();

    if (htmlCard) {
        post.lexical = JSON.stringify(convertToHTMLCard(post.html));
        // eslint-disable-next-line no-console
        console.warn(`Post converted to HTML Card "${post.title}"`, {
            src: post.slug,
            reference: post.title,
            html: post.html
        });
    } else {
        post.lexical = JSON.stringify(htmlToLexical(post.html));
    }

    delete post.html;
};

export {
    convertPost
};
