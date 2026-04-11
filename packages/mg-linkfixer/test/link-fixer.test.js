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

    it('Does not replace external links in Lexical', async function () {
        const fixer = new linkFixer();
        fixer.linkMap = {
            'example.com/my-post/': '/my-post/'
        };

        const lexical = JSON.stringify({
            root: {
                children: [
                    {type: 'link', url: 'https://example.com/my-post/'},
                    {type: 'link', url: 'https://external.com/other/'}
                ]
            }
        });
        const result = await fixer.processLexical(lexical);
        const parsed = JSON.parse(result);

        assert.equal(parsed.root.children[0].url, '/my-post/');
        assert.equal(parsed.root.children[1].url, 'https://external.com/other/');
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

describe('expandForDomains', function () {
    it('Cross-populates linkMap entries for all provided domains', function () {
        const ctx = {
            options: {
                url: 'https://example.com'
            },
            result: {
                posts: [
                    {
                        url: 'https://example.com/my-post/',
                        data: {slug: 'my-post'}
                    }
                ]
            }
        };

        const fixer = new linkFixer();
        fixer.buildMap(ctx);
        fixer.expandForDomains(['https://example.com', 'https://olddomain.com']);

        assert.equal(fixer.linkMap['example.com/my-post/'], '/my-post/');
        assert.equal(fixer.linkMap['olddomain.com/my-post/'], '/my-post/');
    });

    it('Cross-populates tags and authors across all domains', function () {
        const ctx = {
            options: {
                url: 'https://example.com'
            },
            result: {
                posts: [
                    {
                        url: 'https://example.com/my-post/',
                        data: {
                            slug: 'my-post',
                            tags: [
                                {
                                    url: 'https://example.com/category/recipes/',
                                    data: {slug: 'recipes'}
                                }
                            ],
                            author: {
                                url: 'https://example.com/author/jane/',
                                data: {slug: 'jane'}
                            }
                        }
                    }
                ]
            }
        };

        const fixer = new linkFixer();
        fixer.buildMap(ctx);
        fixer.expandForDomains(['https://example.com', 'https://olddomain.com']);

        assert.equal(fixer.linkMap['example.com/category/recipes/'], '/tag/recipes/');
        assert.equal(fixer.linkMap['olddomain.com/category/recipes/'], '/tag/recipes/');
        assert.equal(fixer.linkMap['example.com/author/jane/'], '/author/jane/');
        assert.equal(fixer.linkMap['olddomain.com/author/jane/'], '/author/jane/');
    });

    it('Is a no-op with a single URL', function () {
        const fixer = new linkFixer();
        fixer.linkMap = {'example.com/post/': '/post/'};

        fixer.expandForDomains('https://example.com');

        assert.equal(Object.keys(fixer.linkMap).length, 1);
    });

    it('Is a no-op with no URLs', function () {
        const fixer = new linkFixer();
        fixer.linkMap = {'example.com/post/': '/post/'};

        fixer.expandForDomains(null);

        assert.equal(Object.keys(fixer.linkMap).length, 1);
    });

    it('Fixes HTML links from alternate domains after expansion', async function () {
        const fixer = new linkFixer();
        fixer.linkMap = {
            'example.com/target-post/': '/target-post/'
        };
        fixer.expandForDomains(['https://example.com', 'https://olddomain.com']);

        const html = '<p><a href="https://olddomain.com/target-post/">old link</a></p>';
        const result = await fixer.processHTML(html);

        assert.ok(result.includes('<a href="/target-post/">old link</a>'));
        assert.ok(!result.includes('olddomain.com'));
    });

    it('Fixes Lexical links from alternate domains after expansion', async function () {
        const fixer = new linkFixer();
        fixer.linkMap = {
            'example.com/target-post/': '/target-post/'
        };
        fixer.expandForDomains(['https://example.com', 'https://olddomain.com']);

        const lexical = JSON.stringify({
            root: {
                children: [{
                    type: 'link',
                    url: 'https://olddomain.com/target-post/'
                }]
            }
        });
        const result = await fixer.processLexical(lexical);
        const parsed = JSON.parse(result);

        assert.equal(parsed.root.children[0].url, '/target-post/');
    });
});

describe('cleanURL', function () {
    it('Is accessible as a static method', function () {
        assert.equal(linkFixer.cleanURL('https://example.com/my-post/?ref=home'), 'example.com/my-post/');
    });
});

describe('buildMap with posts from different domains', function () {
    it('Detects dated permalinks using the post URL domain', function () {
        const ctx = {
            options: {
                datedPermalinks: '/yyyy/mm/dd/'
            },
            result: {
                posts: [
                    {
                        url: 'https://olddomain.com/2020/06/27/my-post/',
                        data: {slug: 'my-post'}
                    }
                ]
            }
        };

        const fixer = new linkFixer();
        fixer.buildMap(ctx);

        assert.equal(fixer.linkMap['olddomain.com/2020/06/27/my-post/'], '/2020/06/27/my-post/');
    });
});

describe('fixPost', function () {
    function makePost(data) {
        const store = {...data};
        return {
            get(field) {
                return store[field] ?? null;
            },
            set(field, value) {
                store[field] = value;
            },
            getData() {
                return store;
            }
        };
    }

    it('Fixes HTML links using a lookup function', async function () {
        const fixer = new linkFixer();
        const lookup = (url) => {
            const map = {
                'example.com/target-post/': '/target-post/',
                'example.com/about/': '/about/'
            };
            return map[url] || null;
        };

        const post = makePost({
            html: '<p><a href="https://example.com/target-post/">link</a> and <a href="https://external.com/other/">external</a></p>'
        });

        await fixer.fixPost(post, lookup);

        assert.ok(post.getData().html.includes('<a href="/target-post/">link</a>'));
        assert.ok(post.getData().html.includes('<a href="https://external.com/other/">external</a>'));
    });

    it('Fixes Lexical links using a lookup function', async function () {
        const fixer = new linkFixer();
        const lookup = (url) => {
            if (url === 'example.com/target-post/') {
                return '/target-post/';
            }
            return null;
        };

        const lexical = JSON.stringify({
            root: {
                children: [
                    {type: 'link', url: 'https://example.com/target-post/'},
                    {type: 'link', url: 'https://external.com/other/'}
                ]
            }
        });

        const post = makePost({lexical});
        await fixer.fixPost(post, lookup);

        const result = JSON.parse(post.getData().lexical);
        assert.equal(result.root.children[0].url, '/target-post/');
        assert.equal(result.root.children[1].url, 'https://external.com/other/');
    });

    it('Skips fields that are null or empty', async function () {
        const fixer = new linkFixer();
        const lookup = () => null;

        const post = makePost({html: null, lexical: null});
        await fixer.fixPost(post, lookup);

        assert.equal(post.getData().html, null);
        assert.equal(post.getData().lexical, null);
    });

    it('Strips query params before lookup', async function () {
        const fixer = new linkFixer();
        const lookup = (url) => {
            if (url === 'example.com/my-post/') {
                return '/my-post/';
            }
            return null;
        };

        const post = makePost({
            html: '<p><a href="https://example.com/my-post/?ref=footer">click</a></p>'
        });

        await fixer.fixPost(post, lookup);

        assert.ok(post.getData().html.includes('<a href="/my-post/">click</a>'));
    });
});
