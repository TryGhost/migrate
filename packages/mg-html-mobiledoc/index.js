const ConvertError = require('../lib/ConvertError');
const convertPost = require('../lib/convertPost');

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
