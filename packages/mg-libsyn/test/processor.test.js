import processor from '../lib/processor.js';
import fixture from './fixtures/feed.json';

describe('durationToSeconds', function () {
    test('Minutes with no seconds', function () {
        const result = processor.durationToSeconds('1');
        expect(result).toEqual(60);
    });

    test('Minutes with seconds', function () {
        const result = processor.durationToSeconds('1:00');
        expect(result).toEqual(60);
    });

    test('Minutes with seconds & leading zero', function () {
        const result = processor.durationToSeconds('01:00');
        expect(result).toEqual(60);
    });

    test('2 character minutes with seconds', function () {
        const result = processor.durationToSeconds('10:00');
        expect(result).toEqual(600);
    });

    test('1 character minutes with seconds', function () {
        const result = processor.durationToSeconds('1:23');
        expect(result).toEqual(83);
    });

    test('2 character minutes with odd seconds', function () {
        const result = processor.durationToSeconds('12:34');
        expect(result).toEqual(754);
    });
});

describe('Process posts', function () {
    test('Can process posts', function () {
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

        expect(result.posts).toBeArrayOfSize(2);
    });

    test('Post has required fields', function () {
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

        expect(post).toContainAllKeys(['url', 'data']);
        expect(post.data).toContainAllKeys(['slug', 'title', 'created_at', 'published_at', 'updated_at', 'type', 'status', 'tags', 'author', 'html']);

        expect(post.data.slug).toEqual('lorem-ipsum');
        expect(post.data.title).toEqual('Lorem Ipsum');
        expect(post.data.created_at).toEqual('2020-08-10T07:00:00.000Z');
        expect(post.data.published_at).toEqual('2020-08-10T07:00:00.000Z');
        expect(post.data.updated_at).toEqual('2020-08-10T07:00:00.000Z');
        expect(post.data.type).toEqual('post');
        expect(post.data.status).toEqual('published');
        // Test post.data.html below

        expect(post.data.author).toBeObject();
        expect(post.data.author).toContainAllKeys(['url', 'data']);
        expect(post.data.author.data).toContainAllKeys(['name', 'slug', 'email']);
        expect(post.data.author.data.name).toEqual('Test Author');
        expect(post.data.author.data.slug).toEqual('test-author');
        expect(post.data.author.data.email).toEqual('test@author.com');

        expect(post.data.tags).toBeArray();
        expect(post.data.tags[0]).toContainAllKeys(['url', 'data']);
        expect(post.data.tags[0].data).toContainAllKeys(['name', 'slug']);
    });

    test('Can add a tag', function () {
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

        expect(post.data.tags).toBeArrayOfSize(2);
        expect(post.data.tags[0]).toContainAllKeys(['url', 'data']);
        expect(post.data.tags[0].data).toContainAllKeys(['name', 'slug']);
        expect(post.data.tags[0].data.name).toEqual('My Podcast');
        expect(post.data.tags[0].data.slug).toEqual('my-podcast');
    });

    test('Can use feed categories', function () {
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

        expect(tags).toBeArrayOfSize(5);

        expect(tags[0].url).toEqual('migrator-added-tag-my-podcast');
        expect(tags[0].data.name).toEqual('My Podcast');
        expect(tags[0].data.slug).toEqual('my-podcast');

        expect(tags[1].url).toEqual('migrator-added-tag-lorem');
        expect(tags[1].data.name).toEqual('Lorem');
        expect(tags[1].data.slug).toEqual('lorem');

        expect(tags[2].url).toEqual('migrator-added-tag-ipsum');
        expect(tags[2].data.name).toEqual('Ipsum');
        expect(tags[2].data.slug).toEqual('ipsum');

        expect(tags[3].url).toEqual('migrator-added-tag-dolor');
        expect(tags[3].data.name).toEqual('dolor');
        expect(tags[3].data.slug).toEqual('dolor');

        expect(tags[4].url).toEqual('migrator-added-tag');
        expect(tags[4].data.name).toEqual('#libsyn');
        expect(tags[4].data.slug).toEqual('hash-libsyn');
    });

    test('Can use item categories', function () {
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

        expect(tags).toBeArrayOfSize(4);

        expect(tags[0].url).toEqual('migrator-added-tag-my-podcast');
        expect(tags[0].data.name).toEqual('My Podcast');
        expect(tags[0].data.slug).toEqual('my-podcast');

        expect(tags[1].url).toEqual('migrator-added-tag-exmaple');
        expect(tags[1].data.name).toEqual('exmaple');
        expect(tags[1].data.slug).toEqual('exmaple');

        expect(tags[2].url).toEqual('migrator-added-tag-keywords');
        expect(tags[2].data.name).toEqual('keywords');
        expect(tags[2].data.slug).toEqual('keywords');

        expect(tags[3].url).toEqual('migrator-added-tag');
        expect(tags[3].data.name).toEqual('#libsyn');
        expect(tags[3].data.slug).toEqual('hash-libsyn');
    });
});

describe('Process content', function () {
    test('Remove empty p tags', function () {
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

        expect(post.data.html).toEqual('<!--kg-card-begin: html--><iframe id="embed_12345678" title="Lorem Ipsum" style="border: none" src="//html5-player.libsyn.com/embed/episode/id/12345678/custom-color/000000/" height="90" width="100%" scrolling="no" allowfullscreen webkitallowfullscreen mozallowfullscreen oallowfullscreen msallowfullscreen></iframe><!--kg-card-end: html--><p>Description</p>');
    });

    test('Use Libsyn embeds', function () {
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

        expect(post.data.html).toInclude('<!--kg-card-begin: html--><iframe id="embed_12345678" title="Lorem Ipsum" style="border: none" src="//html5-player.libsyn.com/embed/episode/id/12345678/custom-color/000000/" height="90" width="100%" scrolling="no" allowfullscreen webkitallowfullscreen mozallowfullscreen oallowfullscreen msallowfullscreen></iframe><!--kg-card-end: html--><p>Description</p>');

        expect(post.data.html).not.toInclude('<div class="kg-card kg-audio-card">');
    });

    test('Use Audio cards', function () {
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

        expect(post.data.html).toInclude('<div class="kg-card kg-audio-card">');
        expect(post.data.html).toInclude('<img src="https://ssl-static.libsyn.com/p/assets/1/9/0/c/abcd123434a5734c/cover.jpg"');
        expect(post.data.html).toInclude('<div class="kg-audio-player-container"');
        expect(post.data.html).toInclude('<audio src="https://traffic.libsyn.com/secure/exampleshow/lorem-ipsum.mp3"');
        expect(post.data.html).toInclude('<span class="kg-audio-duration">24:51</span>');

        expect(post.data.html).not.toInclude('<!--kg-card-begin: html--><iframe id="embed_12345678" title="Lorem Ipsum" style="border: none" src="//html5-player.libsyn.com/embed/episode/id/12345678/custom-color/000000/" height="90" width="100%" scrolling="no" allowfullscreen webkitallowfullscreen mozallowfullscreen oallowfullscreen msallowfullscreen></iframe><!--kg-card-end: html--><p>Description</p>');
    });
});
