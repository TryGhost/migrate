import {setImmediate} from 'node:timers/promises';
import {convertPost} from './convert-post.js';
import type {postOptions} from './convert-post.js';

// TODO: Add proper types
const convert = (ctx: any, htmlCard: boolean) => {
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
                // Yield to the event loop before each conversion. Each JSDOM created
                // by htmlToLexical schedules a `process.nextTick` that closes over the
                // whole window, and nextTick callbacks only run once the microtask
                // queue is empty. Without a real event-loop turn between tasks, every
                // window (~1MB) stays pinned until the whole list finishes, which
                // OOMs on large sites.
                await setImmediate();

                try {
                    convertPost(post, htmlCard);
                } catch (error) {
                    if (options.fallBackHTMLCard) {
                        try {
                            convertPost(post, true);
                        } catch (err) {
                            // eslint-disable-next-line no-console
                            console.warn(`Unable to convert post HTMLCard "${post.title}"`, {
                                src: post.slug,
                                reference: post.title,
                                originalError: err,
                                html: post.html
                            });

                            throw err;
                        }
                    } else {
                        // eslint-disable-next-line no-console
                        console.warn(`Unable to convert post to Lexical "${post.title}"`, {
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

export {convert};
