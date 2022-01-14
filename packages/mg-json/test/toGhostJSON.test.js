// Switch these lines once there are useful utils
const testUtils = require('./utils');

// Thing we are testing
const toGhostJSON = require('../lib/to-ghost-json');

// Temp utility
// const inspect = (title, obj) => console.log(title, require('util').inspect(obj, false, null)); // eslint-disable-line no-console

describe('toGhostJSON', function () {
    it('Calculates relations when it only has a post', function () {
        const input = require(testUtils.fixturesFilename('single-post-only.json'));
        const output = toGhostJSON(input);

        output.should.be.GhostJSON();
        output.data.posts.should.be.an.Array().with.lengthOf(1);
        output.data.tags.should.be.an.Array().with.lengthOf(2);

        output.data.users.should.be.an.Array().with.lengthOf(1);
        output.data.users[0].roles[0].should.eql('Administrator');

        output.data.posts_authors.should.be.an.Array().with.lengthOf(1);
        output.data.posts_authors[0].post_id.should.eql(output.data.posts[0].id);
        output.data.posts_authors[0].author_id.should.eql(output.data.users[0].id);

        output.data.posts_tags.should.be.an.Array().with.lengthOf(2);
        output.data.posts_tags[0].post_id.should.eql(output.data.posts[0].id);
        output.data.posts_tags[0].tag_id.should.eql(output.data.tags[0].id);
        output.data.posts_tags[1].post_id.should.eql(output.data.posts[0].id);
        output.data.posts_tags[1].tag_id.should.eql(output.data.tags[1].id);
    });

    // @TODO: make it so that this test doesn't need a post slug or an author
    // Hydrator should be able to cope with absolutely minimal data
    it('Correctly decodes titles', function () {
        const input = {
            posts: [{
                url: 'https://mysite.com',
                data: {
                    slug: 'cool-shit',
                    title: 'This shit&#8217;s cool',
                    author: {
                        url: 'https://mysite.com/me',
                        data: {
                            name: 'me',
                            roles: [
                                'Author'
                            ]
                        }
                    }
                }
            }]
        };
        const output = toGhostJSON(input);

        output.should.be.GhostJSON();
        output.data.posts.should.be.an.Array().with.lengthOf(1);
        output.data.posts[0].title.should.eql('This shit’s cool');
    });

    it('Calculates relations with both post and users', function () {
        const input = require(testUtils.fixturesFilename('single-post-author.json'));

        // inspect('input', input);

        const output = toGhostJSON(input);

        // inspect('output', output);

        output.should.be.GhostJSON();
    });

    it('Calculates relations across multiple posts', function () {
        const input = require(testUtils.fixturesFilename('multi-post-only.json'));

        // inspect('input', input);

        const output = toGhostJSON(input);

        // inspect('output', output);
        output.should.be.GhostJSON();
    });

    it('Ensures internal tags are listed last', function () {
        const input = require(testUtils.fixturesFilename('single-post-with-bad-tag-order.json'));
        const output = toGhostJSON(input);

        output.data.tags.should.be.an.Array().with.lengthOf(3);
        output.data.tags[0].name.should.eql('Things');
        output.data.tags[1].name.should.eql('Stuff');
        output.data.tags[2].name.should.eql('#internal');
    });

    it('Trims strings that are too long', function () {
        const input = require(testUtils.fixturesFilename('single-post-only-long-meta.json'));
        const output = toGhostJSON(input);

        output.data.posts_meta[0].meta_description.length.should.be.belowOrEqual(500);
        output.data.posts_meta[0].feature_image_alt.length.should.be.belowOrEqual(125);
    });

    it('Moves meta data to posts_meta object', function () {
        const input2 = require(testUtils.fixturesFilename('single-post-only-meta.json'));
        const output = toGhostJSON(input2);

        // Data should be in `posts_meta[0]`
        output.data.posts_meta[0].meta_title.should.eql('This is my Blog Post Title');
        output.data.posts_meta[0].meta_description.should.eql('Morbi lectus purus, blandit eu tristique nec, sollicitudin vel odio.');
        output.data.posts_meta[0].feature_image_alt.should.eql('Lorem ipsum dolor sit amet');
        output.data.posts_meta[0].feature_image_caption.should.eql('Caption text');

        // Data should not exist in `posts[0]`
        should.not.exist(output.data.posts[0].meta_title);
        should.not.exist(output.data.posts[0].meta_description);
        should.not.exist(output.data.posts[0].feature_image_alt);
        should.not.exist(output.data.posts[0].feature_image_caption);
    });
});
