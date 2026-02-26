import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import processor from '../lib/processor.js';

const require = createRequire(import.meta.url);
const fixture = require('./fixtures/posts.json');

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
        assert.equal(data.tags.length, 2);
        assert.equal(data.tags[1].data.name, '#ghost');
        assert.equal(data.tags[1].data.slug, 'hash-ghost');
    });
});
