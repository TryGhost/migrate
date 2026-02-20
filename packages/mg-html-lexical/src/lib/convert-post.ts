import {htmlToLexical} from '@tryghost/kg-html-to-lexical';
import errors from '@tryghost/errors';
import {convertToHTMLCard} from './convert-to-html-card.js';

export type postOptions = {
    title: string;
    slug: string;
    lexical?: string;
    html?: string;
}

// Ghost requires at least one child in the root. This empty paragraph is used
// when the HTML conversion produces no children (e.g., empty divs, br tags, etc.)
const emptyParagraph = {
    children: [],
    direction: null,
    format: '',
    indent: 0,
    type: 'paragraph',
    version: 1
};

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
        const lexical = htmlToLexical(post.html);
        // Ensure the root has at least one child (Ghost rejects empty root children)
        if (lexical.root.children.length === 0) {
            lexical.root.children.push(emptyParagraph);
        }
        post.lexical = JSON.stringify(lexical);
    }

    delete post.html;
};

export {
    convertPost
};
