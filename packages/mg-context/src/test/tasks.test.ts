import assert from 'node:assert/strict';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {MigrateContext} from '../index.js';

describe('MigrateContext as tasks', () => {
    test('Runs tasks', async () => {
        let tasks = [];

        tasks.push({
            title: 'Make posts',
            task: async (ctx: any) => { // eslint-disable-line no-unused-vars
                let subTasks = [];

                for (let i = 0; i < 2; i++) {
                    subTasks.push({
                        title: `Task ${i + 1}`,
                        task: async (ctx: any) => { // eslint-disable-line no-shadow
                            await new Promise(r => setTimeout(r, 50)); // eslint-disable-line no-promise-executor-return

                            const post = ctx.MGContext.addPost();
                            post.set('title', `My Post ${i + 1}`);
                            post.set('slug', `my-post-${i + 1}`);
                            post.set('status', 'draft');
                            post.set('created_at', new Date(`2023-11-28T12:0${i + 1}:01.000Z`));
                            post.set('updated_at', new Date(`2023-11-28T12:0${i + 1}:03.000Z`));
                            post.set('published_at', new Date(`2023-11-28T12:0${i + 1}:02.000Z`));
                            post.set('html', `<p>My Post content ${i + 1}</p>`);
                        }
                    });
                }

                return makeTaskRunner(subTasks);
            }
        });

        tasks.push({
            title: 'Add tag & author to all',
            task: async (ctx: any) => {
                await ctx.MGContext.forEachPost((post: any) => {
                    post.addTag({
                        name: 'My Tag',
                        slug: 'my-tag'
                    });

                    post.addAuthor({
                        name: 'Jane',
                        slug: 'jane',
                        email: 'jane@example.com'
                    });
                });
            }
        });

        tasks.push({
            title: 'Add tag to second',
            task: async (ctx: any) => {
                const selectPost = ctx.MGContext.findPosts({title: 'My Post 2'});

                selectPost[0].addTag({
                    name: 'Second Tag',
                    slug: 'second-tag'
                });
            }
        });

        tasks.push({
            title: 'Get JSON',
            task: async (ctx: any) => {
                ctx.json = ctx.MGContext.ghostJson;
            }
        });

        let taskRunner = makeTaskRunner(tasks, {
            concurrent: false,
            renderer: 'silent'
        });

        let context: any = {
            MGContext: new MigrateContext()
        };

        await taskRunner.run(context);

        const json = context.json;
        const data = json.data;

        assert.deepEqual(Object.keys(json), ['meta', 'data']);
        assert.deepEqual(Object.keys(data), ['posts', 'users', 'tags', 'posts_authors', 'posts_tags', 'posts_meta']);

        assert.deepEqual(data.posts[0].title, 'My Post 1');
        assert.deepEqual(data.posts[1].title, 'My Post 2');

        assert.deepEqual(data.tags[0].name, 'My Tag');
        assert.deepEqual(data.tags[1].name, 'Second Tag');

        const firstTagID = data.tags[0].id;
        const secondTagID = data.tags[1].id;

        assert.equal(data.posts_tags[0].tag_id, firstTagID);
        assert.equal(data.posts_tags[1].tag_id, firstTagID);
        assert.equal(data.posts_tags[2].tag_id, secondTagID);
    });
});
