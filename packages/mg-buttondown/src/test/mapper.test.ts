import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {mapContent} from '../lib/mapper.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');

const input = {
    json: JSON.parse(readFileSync(join(fixturesPath, '/emails.json'), 'utf8')),
    posts: [
        {
            name: 'plain-post.md',
            html: readFileSync(join(fixturesPath, '/emails/plain-post.md'), 'utf8')
        },
        {
            name: 'fancy-post.md',
            html: readFileSync(join(fixturesPath, '/emails/fancy-post.md'), 'utf8')
        }
    ]
};

describe('Buttondown Mapper', () => {
    it('Maps a post', async function () {
        const result = await mapContent({
            options: {
                url: 'https://example.com'
            },
            posts: input.posts,
            json: input.json
        });

        if (!('posts' in result)) {
            return;
        }

        const mappedData = result as {posts: mappedDataObject[]};

        assert.equal(mappedData.posts.length, 2);

        assert.equal(mappedData.posts[0].url, 'https://example.com/plain-post');
        assert.equal(mappedData.posts[0].data.slug, 'plain-post');
        assert.equal(mappedData.posts[0].data.published_at.toISOString(), '2023-01-02T16:55:00.000Z');
        assert.equal(mappedData.posts[0].data.updated_at.toISOString(), '2023-01-02T16:55:00.000Z');
        assert.equal(mappedData.posts[0].data.created_at.toISOString(), '2023-01-02T16:55:00.000Z');
        assert.equal(mappedData.posts[0].data.title, 'This is a Plain Post');
        assert.equal(mappedData.posts[0].data.status, 'published');
        assert.equal(mappedData.posts[0].data.custom_excerpt, null);
        assert.equal(mappedData.posts[0].data.visibility, 'public');
        assert.equal(mappedData.posts[0].data.type, 'post');

        assert.equal(mappedData.posts[0].data.tags.length, 1);
        assert.equal(mappedData.posts[0].data.tags[0].url, 'migrator-added-tag-hash-buttondown');
        assert.equal(mappedData.posts[0].data.tags[0].data.slug, 'hash-buttondown');
        assert.equal(mappedData.posts[0].data.tags[0].data.name, '#buttondown');
    });

    it('Returns error if no post files are provided', async function () {
        let inputClone = JSON.parse(JSON.stringify(input));
        inputClone.posts = [];

        const result = await mapContent({
            options: {},
            posts: inputClone.posts,
            json: inputClone.json
        });

        assert.ok(result instanceof Error);
        assert.equal(result.message, 'Input file is empty');
    });

    it('Uses blank HTML if file provided for post', async function () {
        let inputClone = JSON.parse(JSON.stringify(input));

        inputClone.json.push({
            subject: 'Does Not Exist',
            publish_date: '2023-01-02 16:55:00+00:00',
            slug: 'does-not-exist'
        });

        const result: any = await mapContent({
            options: {},
            posts: inputClone.posts,
            json: inputClone.json
        });
        assert.equal(result.posts[2].data.html, '');
    });
});
