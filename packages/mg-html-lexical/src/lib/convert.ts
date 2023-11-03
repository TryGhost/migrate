import {convertPost} from './convert-post.js';
import type {postOptions} from './convert-post.js';

// TODO: Add proper types
const convert = (ctx: any, htmlCard: boolean) => {
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

    // TODO: Add listr tasks types
    let tasks: any = [];

    posts.forEach((post: postOptions) => {
        tasks.push({
            title: `Converting ${post.title}`,
            task: async () => {
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
                            message: `Unable to convert post to Lexical "${post.title}"`,
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
