/* eslint no-undef: 0 */
import processor from '../lib/processor.js';

import fixture from './fixtures/posts.json';

describe('Process', function () {
    test('Can convert a single post', async function () {
        const post = await processor.processPosts(fixture.posts);
        const firstPost = post[0];

        expect(firstPost).toContainKeys(['url', 'data']);
        expect(firstPost.url).toEqual('https://demo.ghost.io/welcome-short/');

        expect(firstPost.data).toBeObject();

        const data = firstPost.data;

        expect(data.title).toEqual('Welcome');
        expect(data.tags).toBeArrayOfSize(2);
        expect(data.tags[1].data.name).toEqual('#ghost');
        expect(data.tags[1].data.slug).toEqual('hash-ghost');
    });
});
