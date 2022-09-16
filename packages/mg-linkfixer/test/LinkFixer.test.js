// Switch these lines once there are useful utils
const testUtils = require('./utils');

// Thing we are testing
const linkFixer = require('../lib/LinkFixer');
const mgJSON = require('@tryghost/mg-json');
const makeTaskRunner = require('../../migrate/lib/task-runner.js');

const getPosts = async (options = {}) => {
    let ctx = null;

    if (options.datedPermalinks === '/yyyy/mm/dd/') {
        ctx = testUtils.fixtures.readSync('ctx-yyyy-mm-dd.json');
    } else if (options.datedPermalinks === '/yyyy/mm/') {
        ctx = testUtils.fixtures.readSync('ctx-yyyy-mm.json');
    } else {
        ctx = testUtils.fixtures.readSync('ctx.json');
    }

    ctx.options = {...ctx.options, ...options};

    ctx.linkFixer = new linkFixer();
    ctx.linkFixer.buildMap(ctx);
    ctx.result = mgJSON.toGhostJSON(ctx.result, ctx.options);

    let tasks = ctx.linkFixer.fix(ctx, []);

    const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
    await doTasks.run();

    return ctx.result.data.posts;
};

describe('LinkFixer', function () {
    it('Fixes links to posts', async function () {
        const posts = await getPosts();

        posts.should.be.an.Array().with.lengthOf(6);

        posts[3].html.should.not.containEql('<a href="https://example.com/2020/06/27/lorem-ipsum/">Consectetur</a>');
        posts[3].html.should.containEql('<a href="/lorem-ipsum/">Consectetur</a>');
    });

    it('Treats http and https links to the same domain equally', async function () {
        const posts = await getPosts();

        posts[4].html.should.not.containEql('<a href="http://example.com/sample-page/">your dashboard</a>');
        posts[4].html.should.containEql('<a href="/sample-page/">your dashboard</a>');
    });

    it('Fixes yyyy-mm-dd dated links to posts', async function () {
        const posts = await getPosts({
            datedPermalinks: '/yyyy/mm/dd/'
        });

        posts.should.be.an.Array().with.lengthOf(5);

        posts[3].html.should.not.containEql('<a href="https://example.com/2020/06/27/lorem-ipsum/">Consectetur</a>');
        posts[3].html.should.containEql('<a href="/2020/06/27/lorem-ipsum/">Consectetur</a>');
    });

    it('Fixes yyyy-mm dated links to posts', async function () {
        const posts = await getPosts({
            datedPermalinks: '/yyyy/mm/'
        });

        posts.should.be.an.Array().with.lengthOf(5);

        posts[3].html.should.not.containEql('<a href="https://example.com/2020/06/lorem-ipsum/">Consectetur</a>');
        posts[3].html.should.containEql('<a href="/2020/06/lorem-ipsum/">Consectetur</a>');
    });

    it('Fixes links to pages', async function () {
        const posts = await getPosts();

        posts[0].html.should.not.containEql('<a href="https://example.com/sample-page/">aspernatur</a>');
        posts[0].html.should.containEql('<a href="/sample-page/">aspernatur</a>');

        posts[2].html.should.not.containEql('<a href="https://example.com/sample-page/child-sample-page/">quis</a>');
        posts[2].html.should.containEql('<a href="/child-sample-page/">quis</a>');
    });

    it('Does not replace external links', async function () {
        const posts = await getPosts();

        posts[0].html.should.containEql('<a href="https://exampleurl.com/eos-quia-quos-voluptas-aliquam-et-et-omnis.html">Sunt tempore nisi similique</a>');
        posts[0].html.should.not.containEql('<a href="/eos-quia-quos-voluptas-aliquam-et-et-omnis.html">Sunt tempore nisi similique</a>');
    });

    it('Does replace tag links that were migrated', async function () {
        const posts = await getPosts();

        posts[1].html.should.not.containEql('<a href="https://example.com/category/cakes/fruit/">dolor</a>');
        posts[1].html.should.containEql('<a href="/tag/fruit/">dolor</a>');
    });

    it('Does not replace tag links that were not migrated', async function () {
        const posts = await getPosts();

        posts[0].html.should.containEql('<a href="https://example.com/tag/delivery/">soluta</a>');
        posts[0].html.should.not.containEql('<a href="/tag/delivery/">soluta</a>');
    });

    it('Fixes links internal that contain query parameters', async function () {
        const posts = await getPosts();

        posts[5].html.should.containEql('<a href="/sample-page/">Sample page with query params</a>');
        posts[5].html.should.not.containEql('<a href="https://example.com/sample-page/?hello=world">Sample page with query params</a>');

        posts[5].html.should.containEql('<a href="/child-sample-page/">Child sample page with query params</a>');
        posts[5].html.should.not.containEql('<a href="https://example.com/sample-page/child-sample-page/?lorem=ipsum">Child sample page with query params</a>');

        posts[5].html.should.containEql('<a href="https://exampleurl.com/sample-page/?let=amos">External sample page with query params</a>');
        posts[5].html.should.not.containEql('<a href="/sample-page/">External sample page with query params</a>');

        posts[5].html.should.containEql('<a href="https://exampleurl.com/sample-page/child-sample-page/?dolor=simet">External child sample page with query params</a></p>');
        posts[5].html.should.not.containEql('<a href="/child-sample-page/">External child sample page with query params</a></p>');
    });
});
