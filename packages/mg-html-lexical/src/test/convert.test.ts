import assert from 'assert/strict';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {convert} from '../index.js';

describe('Convert', function () {
    test('Can convert a list of posts', async function () {
        const ctx: any = {
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
        const ctx: any = {
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
    });

    test('Log warning if post failed to convert to Lexical', async function () {
        const ctx: any = {
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
    });

    test('Finds posts in ctx.results.data.posts', async function () {
        const ctx: any = {
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

    test('Handles empty content', async function () {
        const ctx: any = {
            options: {
                fallBackHTMLCard: false
            },
            result: {
                posts: [
                    {
                        title: 'Title 1',
                        slug: 'slug-1',
                        html: ''
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
        assert.equal(ctx.result.posts[0].lexical, '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}');
    });
});
