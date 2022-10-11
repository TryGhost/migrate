import converter from '@tryghost/html-to-mobiledoc';
import errors from '@tryghost/errors';
import {convertToHTMLCard} from './convertToHTMLCard.js';

const convertPost = (post, htmlCard = false) => {
    if (!post.html) {
        throw new errors.InternalServerError({message: 'Post has no html field to convert'});
    }

    if (htmlCard) {
        post.mobiledoc = JSON.stringify(convertToHTMLCard(post.html));
    } else {
        post.mobiledoc = JSON.stringify(converter.toMobiledoc(post.html));
    }

    // `about:blank` has no place here
    post.mobiledoc = post.mobiledoc.replace(/about:blank/gm, '');

    delete post.html;
};

export {
    convertPost
};
