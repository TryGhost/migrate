const testUtils = require('./utils');
const processor = require('../lib/processor');

describe('Process', function () {
    it('Can convert a single post', async function () {
        const fixture = testUtils.fixtures.readSync('posts.json');

        const post = await processor.processPosts(fixture.posts);
        const firstPost = post[0];

        firstPost.should.be.an.Object().with.properties('url', 'data');
        firstPost.url.should.eql('https://demo.ghost.io/welcome-short/');

        firstPost.data.should.be.an.Object();

        const data = firstPost.data;

        data.title.should.eql('Welcome');
        data.tags.should.be.an.Array().with.lengthOf(2);
        data.tags[1].data.name.should.eql('#ghost');
        data.tags[1].data.slug.should.eql('hash-ghost');
    });
});
