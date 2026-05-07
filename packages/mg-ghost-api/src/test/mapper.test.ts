import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {after, before, describe, it} from 'node:test';
import {MigrateContext} from '@tryghost/mg-context';
import {mapPost, type GhostApiPost} from '../lib/mapper.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');
const fixture = JSON.parse(readFileSync(join(fixturesPath, 'posts.json'), 'utf8')) as {posts: GhostApiPost[]};

describe('mapPost', function () {
    let ctx: MigrateContext;

    before(async function () {
        ctx = new MigrateContext({contentFormat: 'lexical'});
        await ctx.init();
    });

    after(async function () {
        await ctx.close();
    });

    it('populates a PostContext from a Ghost API post', async function () {
        const post = await mapPost(fixture.posts[0], ctx);
        post.save(ctx.db);

        assert.equal(post.get('title'), 'Welcome');
        assert.equal(post.get('slug'), 'welcome-short');
        assert.equal(post.get('status'), 'published');
        assert.equal(post.get('feature_image'), 'https://casper.ghost.org/v2.0.0/images/welcome-to-ghost.jpg');
        assert.equal(post.get('custom_excerpt'), 'Welcome, it\'s great to have you here.');

        const lexical = post.get('lexical');
        assert.ok(lexical, 'lexical was preserved from the Ghost API response');
        assert.match(lexical, /Welcome/);

        assert.ok(post.get('created_at') instanceof Date);
        assert.ok(post.get('published_at') instanceof Date);
    });

    it('adds the #ghost migrator tag alongside source tags', async function () {
        const post = await mapPost(fixture.posts[0], ctx);
        post.save(ctx.db);

        const tags = post.get('tags');
        assert.equal(tags.length, 2, 'one source tag plus the #ghost migrator tag');

        const ghostTag = tags.find((t: {data: {slug: string}}) => t.data.slug === 'hash-ghost');
        assert.ok(ghostTag, '#ghost tag is present');
        assert.equal(ghostTag.data.name, '#ghost');
        assert.equal(ghostTag.data.visibility, 'internal');
    });

    it('upgrades gravatar URLs on author profile_image', async function () {
        const ghPost: GhostApiPost = {
            ...fixture.posts[0],
            authors: [{
                slug: 'gravatar-user',
                name: 'Gravatar User',
                email: 'gravatar@example.com',
                profile_image: '//www.gravatar.com/avatar/abc123?s=250'
            }]
        };

        const post = await mapPost(ghPost, ctx);
        post.save(ctx.db);

        const authors = post.get('authors');
        assert.equal(authors.length, 1);
        assert.equal(authors[0].data.profile_image, 'https://www.gravatar.com/avatar/abc123?s=3000');
    });
});
