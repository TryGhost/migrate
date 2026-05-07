import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, it} from 'node:test';
import processor from '../lib/processor.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');
const fixture = JSON.parse(readFileSync(join(fixturesPath, 'posts.json'), 'utf8'));

describe('Process', function () {
    it('Can convert a single post', async function () {
        const post = await processor.processPosts(fixture.posts);
        const firstPost = post[0];

        assert.ok('url' in firstPost);
        assert.ok('data' in firstPost);
        assert.equal(firstPost.url, 'https://demo.ghost.io/welcome-short/');

        assert.equal(typeof firstPost.data, 'object');
        assert.notEqual(firstPost.data, null);

        const data = firstPost.data;

        assert.equal(data.title, 'Welcome');
        assert.equal(data.tags?.length, 2);
        assert.equal(data.tags?.[1].data.name, '#ghost');
        assert.equal(data.tags?.[1].data.slug, 'hash-ghost');
    });
});
