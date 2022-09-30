/* eslint no-undef: 0 */
const linkFixer = require('../lib/LinkFixer');
const mgJSON = require('@tryghost/mg-json');
const makeTaskRunner = require('../../migrate/lib/task-runner.js');

const getPosts = async (options = {}) => {
    let ctx = null;

    if (options.datedPermalinks === '/yyyy/mm/dd/') {
        ctx = require('./fixtures/ctx-yyyy-mm-dd.json');
    } else if (options.datedPermalinks === '/yyyy/mm/') {
        ctx = require('./fixtures/ctx-yyyy-mm.json');
    } else {
        ctx = require('./fixtures/ctx.json');
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
    let datelessPosts;
    let monthlyPosts;
    let dailyPosts;

    beforeAll(async () => {
        datelessPosts = await getPosts();
        monthlyPosts = await getPosts({datedPermalinks: '/yyyy/mm/'});
        dailyPosts = await getPosts({datedPermalinks: '/yyyy/mm/dd/'});
    });

    test('Fixes links to posts', async function () {
        expect(datelessPosts).toBeArrayOfSize(7);

        expect(datelessPosts[3].html).not.toContain('<a href="https://example.com/2020/06/27/lorem-ipsum/">Consectetur</a>');
        expect(datelessPosts[3].html).toContain('<a href="/lorem-ipsum/">Consectetur</a>');
    });

    test('Treats http and https links to the same domain equally', async function () {
        expect(datelessPosts[4].html).not.toContain('<a href="http://example.com/sample-page/">your dashboard</a>');
        expect(datelessPosts[4].html).toContain('<a href="/sample-page/">your dashboard</a>');
    });

    test('Fixes yyyy-mm-dd dated links to posts', async function () {
        expect(dailyPosts).toBeArrayOfSize(5);

        expect(dailyPosts[3].html).not.toContain('<a href="https://example.com/2020/06/27/lorem-ipsum/">Consectetur</a>');
        expect(dailyPosts[3].html).toContain('<a href="/2020/06/27/lorem-ipsum/">Consectetur</a>');
    });

    test('Fixes yyyy-mm dated links to posts', async function () {
        expect(monthlyPosts).toBeArrayOfSize(5);

        expect(monthlyPosts[3].html).not.toContain('<a href="https://example.com/2020/06/lorem-ipsum/">Consectetur</a>');
        expect(monthlyPosts[3].html).toContain('<a href="/2020/06/lorem-ipsum/">Consectetur</a>');
    });

    test('Fixes links to pages', async function () {
        expect(datelessPosts[0].html).not.toContain('<a href="https://example.com/sample-page/">aspernatur</a>');
        expect(datelessPosts[0].html).toContain('<a href="/sample-page/">aspernatur</a>');

        expect(datelessPosts[2].html).not.toContain('<a href="https://example.com/sample-page/child-sample-page/">quis</a>');
        expect(datelessPosts[2].html).toContain('<a href="/child-sample-page/">quis</a>');
    });

    test('Does not replace external links', async function () {
        expect(datelessPosts[0].html).toContain('<a href="https://exampleurl.com/eos-quia-quos-voluptas-aliquam-et-et-omnis.html">Sunt tempore nisi similique</a>');
        expect(datelessPosts[0].html).not.toContain('<a href="/eos-quia-quos-voluptas-aliquam-et-et-omnis.html">Sunt tempore nisi similique</a>');
    });

    test('Does replace tag links that were migrated', async function () {
        expect(datelessPosts[1].html).not.toContain('<a href="https://example.com/category/cakes/fruit/">dolor</a>');
        expect(datelessPosts[1].html).toContain('<a href="/tag/fruit/">dolor</a>');
    });

    test('Does not replace tag links that were not migrated', async function () {
        expect(datelessPosts[0].html).toContain('<a href="https://example.com/tag/delivery/">soluta</a>');
        expect(datelessPosts[0].html).not.toContain('<a href="/tag/delivery/">soluta</a>');
    });

    test('Fixes links internal that contain query parameters', async function () {
        expect(datelessPosts[5].html).toContain('<a href="/sample-page/">Sample page with query params</a>');
        expect(datelessPosts[5].html).not.toContain('<a href="https://example.com/sample-page/?hello=world">Sample page with query params</a>');

        expect(datelessPosts[5].html).toContain('<a href="/child-sample-page/">Child sample page with query params</a>');
        expect(datelessPosts[5].html).not.toContain('<a href="https://example.com/sample-page/child-sample-page/?lorem=ipsum">Child sample page with query params</a>');

        expect(datelessPosts[5].html).toContain('<a href="https://exampleurl.com/sample-page/?let=amos">External sample page with query params</a>');
        expect(datelessPosts[5].html).not.toContain('<a href="/sample-page/">External sample page with query params</a>');

        expect(datelessPosts[5].html).toContain('<a href="https://exampleurl.com/sample-page/child-sample-page/?dolor=simet">External child sample page with query params</a>');
        expect(datelessPosts[5].html).not.toContain('<a href="/child-sample-page/">External child sample page with query params</a>');

        expect(datelessPosts[5].html).toContain('<a href="/substack-url/">Substack-like URL</a>');
        expect(datelessPosts[5].html).not.toContain('<a href="https://example.com/p/substack-url/?s=w">Substack-like URL</a>');
    });
});
