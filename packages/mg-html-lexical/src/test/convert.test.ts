import assert from 'assert/strict';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {convert} from '../index.js';

let fakeLogger = {
    warn: () => {},
    error: () => {},
    debug: () => {}
};

class fakeLoggerClass {
    #warnings: any[];
    #errors: any[];
    #debugs: any[];

    constructor() {
        this.#warnings = [];
        this.#errors = [];
        this.#debugs = [];
    }

    warn(msg: any) {
        this.#warnings.push(msg);
    }

    get warnings() {
        return this.#warnings;
    }

    error(msg: any) {
        this.#errors.push(msg);
    }

    get errors() {
        return this.#errors;
    }

    debug(msg: any) {
        this.#debugs.push(msg);
    }

    get debugs() {
        return this.#debugs;
    }
}

describe('Convert', function () {
    test('Can convert a list of posts', async function () {
        const ctx: any = {
            logger: fakeLogger,
            options: {
                fallBackHTMLCard: false
            },
            result: {
                posts: [
                    {
                        title: 'Title 1',
                        slug: 'slug-1',
                        html: '<p>Content 1</p>'
                    },
                    {
                        title: 'Title 2',
                        slug: 'slug-2',
                        html: '<p>Content 2</p>'
                    },
                    {
                        title: 'Title 3',
                        slug: 'slug-3',
                        html: '<p>Content 3</p>'
                    }
                ]
            }
        };

        const tasks = convert(ctx, false);

        const taskRunner = makeTaskRunner(tasks, {
            renderer: 'silent'
        });

        await taskRunner.run();

        assert.equal(ctx.result.posts.length, 3);

        assert.deepEqual(Object.keys(ctx.result.posts[0]), ['title', 'slug', 'lexical']);
        assert.deepEqual(ctx.result.posts[0].title, 'Title 1');
        assert.deepEqual(ctx.result.posts[0].slug, 'slug-1');
        assert.deepEqual(ctx.result.posts[0].lexical.startsWith('{"root":{"children"'), true);

        assert.deepEqual(Object.keys(ctx.result.posts[1]), ['title', 'slug', 'lexical']);
        assert.deepEqual(ctx.result.posts[1].title, 'Title 2');
        assert.deepEqual(ctx.result.posts[1].slug, 'slug-2');
        assert.deepEqual(ctx.result.posts[1].lexical.startsWith('{"root":{"children"'), true);

        assert.deepEqual(Object.keys(ctx.result.posts[2]), ['title', 'slug', 'lexical']);
        assert.deepEqual(ctx.result.posts[2].title, 'Title 3');
        assert.deepEqual(ctx.result.posts[2].slug, 'slug-3');
        assert.deepEqual(ctx.result.posts[2].lexical.startsWith('{"root":{"children"'), true);
    });

    test('Log warning if post failed to convert to HTML card', async function () {
        let theFakeLogger = new fakeLoggerClass();

        const ctx: any = {
            logger: theFakeLogger,
            options: {
                fallBackHTMLCard: true
            },
            result: {
                posts: [
                    {
                        title: 'Title 1',
                        slug: 'slug-1',
                        html: '<p>Content 1</p>'
                    },
                    {
                        title: 'Title 2',
                        slug: 'slug-2'
                    },
                    {
                        title: 'Title 3',
                        slug: 'slug-3',
                        html: '<p>Content 3</p>'
                    }
                ]
            }
        };

        const tasks = convert(ctx, false);

        const taskRunner = makeTaskRunner(tasks, {
            renderer: 'silent'
        });

        await taskRunner.run();

        assert.deepEqual(Object.keys(ctx.result.posts[0]), ['title', 'slug', 'lexical']);
        assert.deepEqual(Object.keys(ctx.result.posts[1]), ['title', 'slug']);
        assert.deepEqual(Object.keys(ctx.result.posts[2]), ['title', 'slug', 'lexical']);

        assert.deepEqual(theFakeLogger.warnings.length, 1);
        assert.deepEqual(theFakeLogger.warnings[0].message, 'Unable to convert post HTMLCard "Title 2"');
    });

    test('Log warning if post failed to convert to Lexical', async function () {
        let theFakeLogger = new fakeLoggerClass();

        const ctx: any = {
            logger: theFakeLogger,
            options: {
                fallBackHTMLCard: false
            },
            result: {
                posts: [
                    {
                        title: 'Title 1',
                        slug: 'slug-1',
                        html: '<p>Content 1</p>'
                    },
                    {
                        title: 'Title 2',
                        slug: 'slug-2'
                    },
                    {
                        title: 'Title 3',
                        slug: 'slug-3',
                        html: '<p>Content 3</p>'
                    }
                ]
            }
        };

        const tasks = convert(ctx, false);

        const taskRunner = makeTaskRunner(tasks, {
            renderer: 'silent'
        });

        await taskRunner.run();

        assert.deepEqual(Object.keys(ctx.result.posts[0]), ['title', 'slug', 'lexical']);
        assert.deepEqual(Object.keys(ctx.result.posts[1]), ['title', 'slug']);
        assert.deepEqual(Object.keys(ctx.result.posts[2]), ['title', 'slug', 'lexical']);

        assert.deepEqual(theFakeLogger.warnings.length, 1);
        assert.deepEqual(theFakeLogger.warnings[0].message, 'Unable to convert post to Lexical "Title 2"');
    });

    test('Finds posts in ctx.results.data.posts', async function () {
        const ctx: any = {
            logger: fakeLogger,
            options: {
                fallBackHTMLCard: false
            },
            result: {
                data: {
                    posts: [
                        {
                            title: 'Title 1',
                            slug: 'slug-1',
                            html: '<p>Content 1</p>'
                        }
                    ]
                }
            }
        };

        const tasks = convert(ctx, false);

        const taskRunner = makeTaskRunner(tasks, {
            renderer: 'silent'
        });

        await taskRunner.run();

        assert.equal(ctx.result.data.posts.length, 1);
    });

    test('Finds posts in ctx.db[0].data.posts', async function () {
        const ctx: any = {
            logger: fakeLogger,
            options: {
                fallBackHTMLCard: false
            },
            result: {
                db: [
                    {
                        data: {
                            posts: [
                                {
                                    title: 'Title 1',
                                    slug: 'slug-1',
                                    html: '<p>Content 1</p>'
                                }
                            ]
                        }
                    }
                ]
            }
        };

        const tasks = convert(ctx, false);

        const taskRunner = makeTaskRunner(tasks, {
            renderer: 'silent'
        });

        await taskRunner.run();

        assert.equal(ctx.result.db[0].data.posts.length, 1);
    });
});
