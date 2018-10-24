const converter = require('@tryghost/html-to-mobiledoc');

// Wrap our converter tool and convert to a string
const convertPost = (post) => {
    post.mobiledoc = JSON.stringify(converter.toMobiledoc(post.html));
};

// Understands the data formats, so knows where to look for posts to convert
module.exports.convert = (result) => {
    if (result.posts) {
        result.posts.forEach(convertPost);
    } else if (result.data && result.data.posts) {
        result.data.posts.forEach(convertPost);
    }

    return result;
};
