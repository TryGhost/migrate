// Switch these lines once there are useful utils
const testUtils = require('./utils');

// Thing we are testing
const toGhostJSON = require('../lib/to-ghost-json');

// Temp utility
const inspect = (title, obj) => console.log(title, require('util').inspect(obj, false, null)); // eslint-disable-line no-console

describe('toGhostJSON', function () {
    it('Calculates relations when it only has a post', function () {
        const input = require(testUtils.fixturesFilename('single-post-only.json'));
        const output = toGhostJSON(input);

        output.should.be.GhostJSON();
        output.data.posts.should.be.an.Array().with.lengthOf(1);
        output.data.users.should.be.an.Array().with.lengthOf(1);

        output.data.posts_authors[0].post_id.should.eql(output.data.posts[0].id);
        output.data.posts_authors[0].author_id.should.eql(output.data.users[0].id);
    });

    it.skip('Calculates relations with both post and users', function () {
        const input = require(testUtils.fixturesFilename('single-post-author.json'));

        inspect('input', input);

        const output = toGhostJSON(input);

        inspect('output', output);

        output.should.be.GhostJSON();
    });

    it.skip('Calculates relations across multiple posts', function () {
        const input = require(testUtils.fixturesFilename('multi-post-only.json'));

        inspect('input', input);

        const output = toGhostJSON(input);

        inspect('output', output);
        output.should.be.GhostJSON();
    });
});
