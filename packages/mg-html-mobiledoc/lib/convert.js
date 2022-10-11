import {ConvertError} from './ConvertError.js';
import {convertPost} from './convertPost.js';

const convert = (ctx, htmlCard) => {
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
        });
    });

    return tasks;
};

export {
    convert
};
