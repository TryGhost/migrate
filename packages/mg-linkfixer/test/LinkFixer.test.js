// Switch these lines once there are useful utils
const testUtils = require('./utils');

// Thing we are testing
const linkFixer = require('../lib/LinkFixer');
const mgJSON = require('@tryghost/mg-json');
const makeTaskRunner = require('../../migrate/lib/task-runner.js');

describe('LinkFixer', function () {
    before(async function () {
        let ctx = require(testUtils.fixturesFilename('ctx.json'));

        ctx.linkFixer = new linkFixer();
        ctx.linkFixer.buildMap(ctx);
        ctx.result = mgJSON.toGhostJSON(ctx.result, ctx.options);

        let tasks = ctx.linkFixer.fix(ctx, []);

        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        this.posts = ctx.result.data.posts;
    });

    it('Fixes links to posts', function () {
        const posts = this.posts;

        posts.should.be.an.Array().with.lengthOf(5);

        posts[3].html.should.not.containEql('<a href="https://example.com/2020/06/27/lorem-ipsum/">Consectetur</a>');
        posts[3].html.should.containEql('<a href="/lorem-ipsum/">Consectetur</a>');
    });

    it('Fixes links to pages', function () {
        const posts = this.posts;

        posts[0].html.should.not.containEql('<a href="https://example.com/sample-page/">aspernatur</a>');
        posts[0].html.should.containEql('<a href="/sample-page/">aspernatur</a>');

        posts[2].html.should.not.containEql('<a href="https://example.com/sample-page/child-sample-page/">quis</a>');
        posts[2].html.should.containEql('<a href="/child-sample-page/">quis</a>');
    });

    it('Does not replace external links', function () {
        const posts = this.posts;

        posts[0].html.should.containEql('<a href="https://dummyurl.com/eos-quia-quos-voluptas-aliquam-et-et-omnis.html">Sunt tempore nisi similique</a>');
        posts[0].html.should.not.containEql('<a href="/eos-quia-quos-voluptas-aliquam-et-et-omnis.html">Sunt tempore nisi similique</a>');
    });

    it('Does replace tag links that were migrated', function () {
        const posts = this.posts;

        posts[1].html.should.not.containEql('<a href="https://example.com/category/cakes/fruit/">dolor</a>');
        posts[1].html.should.containEql('<a href="/tag/fruit/">dolor</a>');
    });

    it('Does not replace tag links that was not migrated', function () {
        const posts = this.posts;

        posts[0].html.should.containEql('<a href="https://example.com/tag/delivery/">soluta</a>');
        posts[0].html.should.not.containEql('<a href="/tag/delivery/">soluta</a>');
    });
});
