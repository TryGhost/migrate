const converter = require('@tryghost/html-to-mobiledoc');

const convertToHTMLCard = (html) => {
    let structure = {
        version: '0.3.1',
        markups: [],
        atoms: [],
        cards: [['html', {cardName: 'html', html: html}]],
        sections: [[10, 0]]
    };

    return structure;
};

// Wrap our converter tool and convert to a string
const convertPost = (post, htmlCard) => {
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

// Understands the data formats, so knows where to look for posts to convert
module.exports.convert = (ctx, htmlCard) => {
    let res = ctx.result;
    let posts = res.posts;

    if (!posts && res.data && res.data.posts) {
        posts = res.data.posts;
    }

    if (!posts && res.db && res.db[0] && res.db[0].data && res.db[0].data.posts) {
        posts = res.db[0].data.posts;
    }

    let tasks = posts.map((post) => {
        return {
            title: `Converting ${post.title}`,
            task: () => {
                try {
                    convertPost(post, htmlCard);
                } catch (error) {
                    let convertError = new Error(`Unable to convert post ${post.title}`);
                    convertError.reference = post.slug;
                    convertError.originalError = error;

                    ctx.errors.push(convertError);
                    throw convertError;
                }
            }
        };
    });

    return tasks;
};
