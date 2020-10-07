const converter = require('@tryghost/html-to-mobiledoc');
const {convertToHTMLCard} = require('./convertToHTMLCard');

module.exports.convertPost = (post, htmlCard) => {
    if (!post.html) {
        throw new Error('Post has no html field to convert');
    }

    if (htmlCard) {
        post.mobiledoc = JSON.stringify(convertToHTMLCard(post.html));
    } else {
        post.mobiledoc = JSON.stringify(converter.toMobiledoc(post.html));
    }

    delete post.html;
};
