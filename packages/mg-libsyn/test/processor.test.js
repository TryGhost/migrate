import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {createRequire} from 'node:module';
import processor from '../lib/processor.js';

const require = createRequire(import.meta.url);
const fixture = require('./fixtures/feed.json');

describe('durationToSeconds', function () {
    it('Minutes with no seconds', function () {
        const result = processor.durationToSeconds('1');
        assert.equal(result, 60);
    });

    it('Minutes with seconds', function () {
        const result = processor.durationToSeconds('1:00');
        assert.equal(result, 60);
    });

    it('Minutes with seconds & leading zero', function () {
        const result = processor.durationToSeconds('01:00');
        assert.equal(result, 60);
    });

    it('2 character minutes with seconds', function () {
        const result = processor.durationToSeconds('10:00');
        assert.equal(result, 600);
    });

    it('1 character minutes with seconds', function () {
        const result = processor.durationToSeconds('1:23');
        assert.equal(result, 83);
    });

    it('2 character minutes with odd seconds', function () {
        const result = processor.durationToSeconds('12:34');
        assert.equal(result, 754);
    });
});

describe('Process posts', function () {
    it('Can process posts', function () {
        const data = {
            posts: fixture.rss.channel.item,
            author: {
                name: 'Test Author',
                slug: 'test-author',
                email: 'test@author.com'
            }
        };

        const result = processor.all({
            result: data,
            options: {
                url: 'https://example.com'
            }
        });

        assert.equal(result.posts.length, 2);
    });

    it('Post has required fields', function () {
        const data = {
            posts: fixture.rss.channel.item,
            author: {
                name: 'Test Author',
                slug: 'test-author',
                email: 'test@author.com'
            }
        };

        const result = processor.all({
            result: data,
            options: {
                useEmbed: true,
                url: 'https://example.com'
            }
        });

        const post = result.posts[0];

        for (const key of ['url', 'data']) {
            assert.ok(key in post);
        }
        for (const key of ['slug', 'title', 'created_at', 'published_at', 'updated_at', 'type', 'status', 'tags', 'author', 'html']) {
            assert.ok(key in post.data);
        }

        assert.equal(post.data.slug, 'lorem-ipsum');
        assert.equal(post.data.title, 'Lorem Ipsum');
        assert.equal(post.data.created_at, '2020-08-10T07:00:00.000Z');
        assert.equal(post.data.published_at, '2020-08-10T07:00:00.000Z');
        assert.equal(post.data.updated_at, '2020-08-10T07:00:00.000Z');
        assert.equal(post.data.type, 'post');
        assert.equal(post.data.status, 'published');
        // Test post.data.html below

        assert.equal(typeof post.data.author, 'object');
        assert.ok(post.data.author !== null);
        for (const key of ['url', 'data']) {
            assert.ok(key in post.data.author);
        }
        for (const key of ['name', 'slug', 'email']) {
            assert.ok(key in post.data.author.data);
        }
        assert.equal(post.data.author.data.name, 'Test Author');
        assert.equal(post.data.author.data.slug, 'test-author');
        assert.equal(post.data.author.data.email, 'test@author.com');

        assert.ok(Array.isArray(post.data.tags));
        for (const key of ['url', 'data']) {
            assert.ok(key in post.data.tags[0]);
        }
        for (const key of ['name', 'slug']) {
            assert.ok(key in post.data.tags[0].data);
        }
    });

    it('Can add a tag', function () {
        const data = {
            posts: fixture.rss.channel.item,
            author: {
                name: 'Test Author',
                slug: 'test-author',
                email: 'test@author.com'
            }
        };

        const result = processor.all({
            result: data,
            options: {
                useEmbed: true,
                useFeedCategories: false,
                useItemKeywords: false,
                url: 'https://example.com',
                addTag: 'My Podcast'
            }
        });

        const post = result.posts[0];

        assert.equal(post.data.tags.length, 2);
        for (const key of ['url', 'data']) {
            assert.ok(key in post.data.tags[0]);
        }
        for (const key of ['name', 'slug']) {
            assert.ok(key in post.data.tags[0].data);
        }
        assert.equal(post.data.tags[0].data.name, 'My Podcast');
        assert.equal(post.data.tags[0].data.slug, 'my-podcast');
    });

    it('Can use feed categories', function () {
        const data = {
            posts: fixture.rss.channel.item,
            tags: ['Lorem', 'Ipsum', 'dolor'],
            author: {
                name: 'Test Author',
                slug: 'test-author',
                email: 'test@author.com'
            }
        };

        const result = processor.all({
            result: data,
            options: {
                useEmbed: true,
                useFeedCategories: true,
                useItemKeywords: false,
                url: 'https://example.com',
                addTag: 'My Podcast'
            }
        });

        const post = result.posts[0];
        const tags = post.data.tags;

        assert.equal(tags.length, 5);

        assert.equal(tags[0].url, 'migrator-added-tag-my-podcast');
        assert.equal(tags[0].data.name, 'My Podcast');
        assert.equal(tags[0].data.slug, 'my-podcast');

        assert.equal(tags[1].url, 'migrator-added-tag-lorem');
        assert.equal(tags[1].data.name, 'Lorem');
        assert.equal(tags[1].data.slug, 'lorem');

        assert.equal(tags[2].url, 'migrator-added-tag-ipsum');
        assert.equal(tags[2].data.name, 'Ipsum');
        assert.equal(tags[2].data.slug, 'ipsum');

        assert.equal(tags[3].url, 'migrator-added-tag-dolor');
        assert.equal(tags[3].data.name, 'dolor');
        assert.equal(tags[3].data.slug, 'dolor');

        assert.equal(tags[4].url, 'migrator-added-tag');
        assert.equal(tags[4].data.name, '#libsyn');
        assert.equal(tags[4].data.slug, 'hash-libsyn');
    });

    it('Can use item categories', function () {
        const data = {
            posts: fixture.rss.channel.item,
            author: {
                name: 'Test Author',
                slug: 'test-author',
                email: 'test@author.com'
            }
        };

        const result = processor.all({
            result: data,
            options: {
                useEmbed: true,
                useFeedCategories: false,
                useItemKeywords: true,
                url: 'https://example.com',
                addTag: 'My Podcast'
            }
        });

        const post = result.posts[0];
        const tags = post.data.tags;

        assert.equal(tags.length, 4);

        assert.equal(tags[0].url, 'migrator-added-tag-my-podcast');
        assert.equal(tags[0].data.name, 'My Podcast');
        assert.equal(tags[0].data.slug, 'my-podcast');

        assert.equal(tags[1].url, 'migrator-added-tag-exmaple');
        assert.equal(tags[1].data.name, 'exmaple');
        assert.equal(tags[1].data.slug, 'exmaple');

        assert.equal(tags[2].url, 'migrator-added-tag-keywords');
        assert.equal(tags[2].data.name, 'keywords');
        assert.equal(tags[2].data.slug, 'keywords');

        assert.equal(tags[3].url, 'migrator-added-tag');
        assert.equal(tags[3].data.name, '#libsyn');
        assert.equal(tags[3].data.slug, 'hash-libsyn');
    });
});

describe('Process content', function () {
    it('Remove empty p tags', function () {
        const data = {
            posts: fixture.rss.channel.item,
            author: {
                name: 'Test Author',
                slug: 'test-author',
                email: 'test@author.com'
            }
        };

        const result = processor.all({
            result: data,
            options: {
                useEmbed: true,
                url: 'https://example.com'
            }
        });

        const post = result.posts[0];

        assert.equal(post.data.html, '<!--kg-card-begin: html--><iframe id="embed_12345678" title="Lorem Ipsum" style="border: none" src="//html5-player.libsyn.com/embed/episode/id/12345678/custom-color/000000/" height="90" width="100%" scrolling="no" allowfullscreen webkitallowfullscreen mozallowfullscreen oallowfullscreen msallowfullscreen></iframe><!--kg-card-end: html--><p>Description</p>');
    });

    it('Use Libsyn embeds', function () {
        const data = {
            posts: fixture.rss.channel.item,
            author: {
                name: 'Test Author',
                slug: 'test-author',
                email: 'test@author.com'
            }
        };

        const result = processor.all({
            result: data,
            options: {
                useEmbed: true,
                url: 'https://example.com'
            }
        });

        const post = result.posts[0];

        assert.ok(post.data.html.includes('<!--kg-card-begin: html--><iframe id="embed_12345678" title="Lorem Ipsum" style="border: none" src="//html5-player.libsyn.com/embed/episode/id/12345678/custom-color/000000/" height="90" width="100%" scrolling="no" allowfullscreen webkitallowfullscreen mozallowfullscreen oallowfullscreen msallowfullscreen></iframe><!--kg-card-end: html--><p>Description</p>'));

        assert.ok(!post.data.html.includes('<div class="kg-card kg-audio-card">'));
    });

    it('Use Audio cards', function () {
        const data = {
            posts: fixture.rss.channel.item,
            author: {
                name: 'Test Author',
                slug: 'test-author',
                email: 'test@author.com'
            }
        };

        const result = processor.all({
            result: data,
            options: {
                useEmbed: false,
                url: 'https://example.com'
            }
        });

        const post = result.posts[0];

        assert.ok(post.data.html.includes('<div class="kg-card kg-audio-card">'));
        assert.ok(post.data.html.includes('<img src="https://ssl-static.libsyn.com/p/assets/1/9/0/c/abcd123434a5734c/cover.jpg"'));
        assert.ok(post.data.html.includes('<div class="kg-audio-player-container"'));
        assert.ok(post.data.html.includes('<audio src="https://traffic.libsyn.com/secure/exampleshow/lorem-ipsum.mp3"'));
        assert.ok(post.data.html.includes('<span class="kg-audio-duration">24:51</span>'));

        assert.ok(!post.data.html.includes('<!--kg-card-begin: html--><iframe id="embed_12345678" title="Lorem Ipsum" style="border: none" src="//html5-player.libsyn.com/embed/episode/id/12345678/custom-color/000000/" height="90" width="100%" scrolling="no" allowfullscreen webkitallowfullscreen mozallowfullscreen oallowfullscreen msallowfullscreen></iframe><!--kg-card-end: html--><p>Description</p>'));
    });
});
