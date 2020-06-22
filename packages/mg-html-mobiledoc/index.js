const converter = require('@tryghost/html-to-mobiledoc');

const ConvertError = ({src, message = `Unable to convert post to Mobiledoc`, reference, originalError}) => {
    let error = new Error(`${message} - ${src}`);

    error.errorType = 'ConvertError';
    error.code = originalError.message;
    error.src = src;
    if (reference) {
        error.reference = reference;
    }
    error.originalError = originalError;

    return error;
};

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
    let {options} = ctx;
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
                    if (options.fallBackHTMLCard) {
                        try {
                            convertPost(post, true);
                        } catch (err) {
                            let convertError = ConvertError(
                                {
                                    message: `Unable to convert post HTMLCard "${post.title}"`,
                                    src: post.slug,
                                    reference: post.title,
                                    originalError: err
                                });

                            ctx.errors.push(convertError);
                            throw convertError;
                        }
                    } else {
                        let convertError = ConvertError(
                            {
                                message: `Unable to convert post to Mobiledoc "${post.title}"`,
                                src: post.slug,
                                reference: post.title,
                                originalError: error
                            });

                        ctx.errors.push(convertError);
                        throw convertError;
                    }
                }
            }
        };
    });

    return tasks;
};
