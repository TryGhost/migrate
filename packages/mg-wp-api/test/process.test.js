// Switch these lines once there are useful utils
const testUtils = require('./utils');

const processor = require('../lib/processor');

describe('Process', function () {
    it('Can convert a single post', function () {
        const fixture = testUtils.fixtures.readSync('single-post.json');
        const users = [];
        const fetchTags = true;
        const post = processor.processPost(fixture, users, fetchTags);

        post.should.be.an.Object().with.properties('url', 'data');

        post.url.should.eql('https://mysite.com/boop/my-awesome-post');
        post.data.should.be.an.Object();

        const data = post.data;
        data.slug.should.eql('my-awesome-post');
        data.title.should.eql('My Awesome Post');
        // data.excerpt.should.eql('This is my strong headline thing. Here we have some excerpt content [&hellip;]');
        data.html.should.eql('\n<h2><strong>This is my strong headline thing.<\/strong><\/h2>\n\n\n\n<p><em>Note: this article contains awesomeness<\/em><\/p>\n\n\n\n<p>This is a paragraph of text. This is a very short dummy post.<\/p>\n\n\n\n<!--kg-card-begin: html--><div style=\"height:43px\" aria-hidden=\"true\" class=\"wp-block-spacer\"><\/div><!--kg-card-end: html-->\n'); /* eslint-disable-line no-useless-escape */

        data.tags.should.be.an.Array().with.lengthOf(6);
        data.tags[5].data.name.should.eql('#wordpress');
    });
});
