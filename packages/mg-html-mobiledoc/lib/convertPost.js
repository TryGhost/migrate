const converter = require('@tryghost/html-to-mobiledoc');
const {convertToHTMLCard} = require('./convertToHTMLCard');
const errors = require('@tryghost/errors');

module.exports.convertPost = (post, htmlCard) => {
    if (!post.html) {
        throw new errors.GhostError({message: 'Post has no html field to convert'});
    }

    if (htmlCard) {
        post.mobiledoc = JSON.stringify(convertToHTMLCard(post.html));
    } else {
        post.mobiledoc = JSON.stringify(converter.toMobiledoc(post.html));
    }

    delete post.html;
};
