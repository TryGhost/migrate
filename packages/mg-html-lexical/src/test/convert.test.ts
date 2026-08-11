import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {convert} from '../index.js';

describe('Convert', function () {
    it('Can convert a list of posts', async function () {
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

    it('Log warning if post failed to convert to HTML card', async function () {
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

    it('Log warning if post failed to convert to Lexical', async function () {
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

    it('Finds posts in ctx.results.data.posts', async function () {
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

    it('Finds posts in ctx.db[0].data.posts', async function () {
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

    it('Falls back to HTML card when Lexical conversion fails', async function () {
        // Inline MathML crashes Lexical's DOM walk; with fallBackHTMLCard the
        // content must be preserved as an HTML card instead of a blank document
        const mathHtml = '<p>a <math><mi>x</mi></math> b</p>';
        const ctx: any = {
            options: {
                fallBackHTMLCard: true
            },
            result: {
                posts: [
                    {
                        title: 'Math post',
                        slug: 'math-post',
                        html: mathHtml
                    }
                ]
            }
        };

        const tasks = convert(ctx, false);

        const taskRunner = makeTaskRunner(tasks, {
            renderer: 'silent'
        });

        await taskRunner.run();

        const post = ctx.result.posts[0];
        assert.equal(post.html, undefined);

        const lexical = JSON.parse(post.lexical);
        assert.equal(lexical.root.children[0].type, 'html');
        assert.equal(lexical.root.children[0].html, mathHtml);
    });

    it('Yields to the event loop between conversions', async function () {
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

        // Count event-loop turns while the tasks run. Without a yield per task,
        // the whole list runs as one microtask cascade and pending macrotasks
        // (like jsdom's window-releasing nextTick callbacks) never fire until
        // the end, pinning every JSDOM in memory at once.
        let turns = 0;
        let counting = true;
        const countTurns = () => {
            turns += 1;
            if (counting) {
                setImmediate(countTurns);
            }
        };
        setImmediate(countTurns);

        const taskRunner = makeTaskRunner(tasks, {
            renderer: 'silent',
            concurrent: 1
        });

        await taskRunner.run();
        counting = false;

        assert.ok(turns >= 3, `expected at least one event-loop turn per post, saw ${turns}`);
        assert.deepEqual(Object.keys(ctx.result.posts[0]), ['title', 'slug', 'lexical']);
        assert.deepEqual(Object.keys(ctx.result.posts[1]), ['title', 'slug', 'lexical']);
        assert.deepEqual(Object.keys(ctx.result.posts[2]), ['title', 'slug', 'lexical']);
    });

    it('Handles empty content', async function () {
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
        assert.equal(
            ctx.result.posts[0].lexical,
            '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
        );
    });
});
