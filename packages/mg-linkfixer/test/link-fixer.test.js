import assert from 'node:assert/strict';
import {describe, it, before} from 'node:test';
import {createRequire} from 'node:module';
import {toGhostJSON} from '@tryghost/mg-json';
import linkFixer from '../lib/LinkFixer.js';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';

const require = createRequire(import.meta.url);
const standardFixtures = require('./fixtures/ctx.json');
const standardLexicalFixtures = require('./fixtures/ctx-lexical.json');
const yyyymmFixtures = require('./fixtures/ctx-yyyy-mm.json');
const slugYyyymmFixtures = require('./fixtures/ctx-slug-yyyy-mm.json');
const yyyymmddFixtures = require('./fixtures/ctx-yyyy-mm-dd.json');
const slugYyyymmddFixtures = require('./fixtures/ctx-slug-yyyy-mm-dd.json');

const getPosts = async (options = {}) => {
    let ctx = null;

    if (options.datedPermalinks === '/yyyy/mm/dd/') {
        ctx = yyyymmddFixtures;
    } else if (options.datedPermalinks === '/yyyy/mm/') {
        ctx = yyyymmFixtures;
    } else if (options.datedPermalinks === '/*/yyyy/mm/') {
        ctx = slugYyyymmFixtures;
    } else if (options.datedPermalinks === '/*/yyyy/mm/dd/') {
        ctx = slugYyyymmddFixtures;
    } else if (options.lexical === true) {
        ctx = standardLexicalFixtures;
    } else {
        ctx = standardFixtures;
    }

    ctx.options = {...ctx.options, ...options};

    ctx.linkFixer = new linkFixer();
    ctx.linkFixer.buildMap(ctx);

    ctx.result = await toGhostJSON(ctx.result, ctx.options);

    let tasks = ctx.linkFixer.fix(ctx, []);

    const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
    await doTasks.run();

    return ctx.result.data.posts;
};

let slugMonthlyPosts;
let monthlyPosts;
let slugDailyPosts;
let dailyPosts;
let datelessLexicalPosts;
let datelessPosts;

before(async () => {
    slugMonthlyPosts = await getPosts({datedPermalinks: '/*/yyyy/mm/'});
    monthlyPosts = await getPosts({datedPermalinks: '/yyyy/mm/'});
    slugDailyPosts = await getPosts({datedPermalinks: '/*/yyyy/mm/dd/'});
    dailyPosts = await getPosts({datedPermalinks: '/yyyy/mm/dd/'});
    datelessLexicalPosts = await getPosts({lexical: true});
    datelessPosts = await getPosts();
});

describe('LinkFixer', function () {
    it('Fixes links to posts in HTML', async function () {
        assert.equal(datelessPosts.length, 7);

        assert.ok(!datelessPosts[3].html.includes('<a href="https://example.com/2020/06/27/lorem-ipsum/">Consectetur</a>'));
        assert.ok(datelessPosts[3].html.includes('<a href="/lorem-ipsum/">Consectetur</a>'));
    });

    it('Fixes links to posts in Lexical', async function () {
        assert.equal(datelessLexicalPosts.length, 7);

        assert.ok(!datelessLexicalPosts[0].lexical.includes(`"url":"https://example.com/lorem-ipsum/"`));
        assert.ok(datelessLexicalPosts[0].lexical.includes(`"url":"/lorem-ipsum/"`));

        assert.ok(!datelessLexicalPosts[0].lexical.includes(`"url":"https://example.com/dolor-simet/"`));
        assert.ok(datelessLexicalPosts[0].lexical.includes(`"url":"/dolor-simet/"`));

        assert.ok(!datelessLexicalPosts[0].lexical.includes(`"url":"https://example.com/est-vitae/"`));
        assert.ok(datelessLexicalPosts[0].lexical.includes(`"url":"/est-vitae/"`));

        assert.ok(!datelessLexicalPosts[0].lexical.includes(`"url":"https://example.com/sample-page/child-sample-page/"`));
        assert.ok(datelessLexicalPosts[0].lexical.includes(`"url":"/child-sample-page/"`));

        assert.ok(!datelessLexicalPosts[0].lexical.includes(`"url":"https://example.com/sample-page/"`));
        assert.ok(datelessLexicalPosts[0].lexical.includes(`"url":"/sample-page/"`));

        assert.ok(!datelessLexicalPosts[0].lexical.includes(`"url":"https://example.com/query-params/"`));
        assert.ok(datelessLexicalPosts[0].lexical.includes(`"url":"/query-params/"`));

        assert.ok(!datelessLexicalPosts[0].lexical.includes(`"url":"https://example.com/p/substack-url/"`));
        assert.ok(datelessLexicalPosts[0].lexical.includes(`"url":"/substack-url/"`));
    });

    it('Treats http and https links to the same domain equally', async function () {
        assert.ok(!datelessPosts[4].html.includes('<a href="http://example.com/sample-page/">your dashboard</a>'));
        assert.ok(datelessPosts[4].html.includes('<a href="/sample-page/">your dashboard</a>'));
    });

    it('Fixes yyyy-mm-dd dated links to posts', async function () {
        assert.equal(dailyPosts.length, 5);

        assert.ok(!dailyPosts[3].html.includes('<a href="https://example.com/2020/06/27/lorem-ipsum/">Consectetur</a>'));
        assert.ok(dailyPosts[3].html.includes('<a href="/2020/06/27/lorem-ipsum/">Consectetur</a>'));
    });

    it('Fixes slug-yyyy-mm-dd dated links to posts', async function () {
        assert.equal(slugDailyPosts.length, 5);

        assert.ok(!slugDailyPosts[3].html.includes('<a href="https://example.com/articles/2020/06/27/lorem-ipsum/">Consectetur</a>'));
        assert.ok(slugDailyPosts[3].html.includes('<a href="/2020/06/27/lorem-ipsum/">Consectetur</a>'));
    });

    it('Fixes yyyy-mm dated links to posts', async function () {
        assert.equal(monthlyPosts.length, 5);

        assert.ok(!monthlyPosts[3].html.includes('<a href="https://example.com/2020/06/lorem-ipsum/">Consectetur</a>'));
        assert.ok(monthlyPosts[3].html.includes('<a href="/2020/06/lorem-ipsum/">Consectetur</a>'));
    });

    it('Fixes slug-yyyy-mm dated links to posts', async function () {
        assert.equal(slugMonthlyPosts.length, 5);

        assert.ok(!slugMonthlyPosts[3].html.includes('<a href="https://example.com/articles/2020/06/lorem-ipsum/">Consectetur</a>'));
        assert.ok(slugMonthlyPosts[3].html.includes('<a href="/2020/06/lorem-ipsum/">Consectetur</a>'));
    });

    it('Fixes links to pages', async function () {
        assert.ok(!datelessPosts[0].html.includes('<a href="https://example.com/sample-page/">aspernatur</a>'));
        assert.ok(datelessPosts[0].html.includes('<a href="/sample-page/">aspernatur</a>'));

        assert.ok(!datelessPosts[2].html.includes('<a href="https://example.com/sample-page/child-sample-page/">quis</a>'));
        assert.ok(datelessPosts[2].html.includes('<a href="/child-sample-page/">quis</a>'));
    });

    it('Does not replace external links', async function () {
        assert.ok(datelessPosts[0].html.includes('<a href="https://exampleurl.com/eos-quia-quos-voluptas-aliquam-et-et-omnis.html">Sunt tempore nisi similique</a>'));
        assert.ok(!datelessPosts[0].html.includes('<a href="/eos-quia-quos-voluptas-aliquam-et-et-omnis.html">Sunt tempore nisi similique</a>'));
    });

    it('Does replace tag links that were migrated', async function () {
        assert.ok(!datelessPosts[1].html.includes('<a href="https://example.com/category/cakes/fruit/">dolor</a>'));
        assert.ok(datelessPosts[1].html.includes('<a href="/tag/fruit/">dolor</a>'));
    });

    it('Does not replace tag links that were not migrated', async function () {
        assert.ok(datelessPosts[0].html.includes('<a href="https://example.com/tag/delivery/">soluta</a>'));
        assert.ok(!datelessPosts[0].html.includes('<a href="/tag/delivery/">soluta</a>'));
    });

    it('Fixes links internal that contain query parameters', async function () {
        assert.ok(datelessPosts[5].html.includes('<a href="/sample-page/">Sample page with query params</a>'));
        assert.ok(!datelessPosts[5].html.includes('<a href="https://example.com/sample-page/?hello=world">Sample page with query params</a>'));

        assert.ok(datelessPosts[5].html.includes('<a href="/child-sample-page/">Child sample page with query params</a>'));
        assert.ok(!datelessPosts[5].html.includes('<a href="https://example.com/sample-page/child-sample-page/?lorem=ipsum">Child sample page with query params</a>'));

        assert.ok(datelessPosts[5].html.includes('<a href="https://exampleurl.com/sample-page/?let=amos">External sample page with query params</a>'));
        assert.ok(!datelessPosts[5].html.includes('<a href="/sample-page/">External sample page with query params</a>'));

        assert.ok(datelessPosts[5].html.includes('<a href="https://exampleurl.com/sample-page/child-sample-page/?dolor=simet">External child sample page with query params</a>'));
        assert.ok(!datelessPosts[5].html.includes('<a href="/child-sample-page/">External child sample page with query params</a>'));

        assert.ok(datelessPosts[5].html.includes('<a href="/substack-url/">Substack-like URL</a>'));
        assert.ok(!datelessPosts[5].html.includes('<a href="https://example.com/p/substack-url/?s=w">Substack-like URL</a>'));
    });
});
