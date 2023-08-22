import {convertPost} from './convert-post.js';

const convert = (ctx, htmlCard) => {
    const {logger} = ctx;
    let {options} = ctx;
    let res = ctx.result;
    let posts = res.posts;

    if (!posts && res.data && res.data.posts) {
        posts = res.data.posts;
    }

    if (!posts && res.db && res.db[0] && res.db[0].data && res.db[0].data.posts) {
        posts = res.db[0].data.posts;
    }

    let tasks = [];

    posts.forEach((post) => {
        tasks.push({
            title: `Converting ${post.title}`,
            task: async () => {
                // Artificially slow this down
                await new Promise(r => setTimeout(r, 10)); // eslint-disable-line no-promise-executor-return

                try {
                    convertPost(post, htmlCard, logger);
                } catch (error) {
                    if (options.fallBackHTMLCard) {
                        try {
                            convertPost(post, true, logger);
                        } catch (err) {
                            logger.warn({
                                message: `Unable to convert post HTMLCard "${post.title}"`,
                                src: post.slug,
                                reference: post.title,
                                originalError: err,
                                html: post.html
                            });

                            throw err;
                        }
                    } else {
                        logger.warn({
                            message: `Unable to convert post to Mobiledoc "${post.title}"`,
                            src: post.slug,
                            reference: post.title,
                            originalError: error,
                            html: post.html
                        });

                        throw error;
                    }
                }
            }
        });
    });

    return tasks;
};

export {
    convert
};
