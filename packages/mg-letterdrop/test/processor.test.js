import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {createRequire} from 'node:module';
import processor from '../lib/processor.js';

const require = createRequire(import.meta.url);
const fixture = require('./fixtures/api-response.json');

describe('Process', function () {
    it('Can convert a single post', function () {
        const ctx = {
            result: fixture,
            options: {
                url: 'https://example.com',
                addPrimaryTag: 'Newsletter',
                email: 'person@example.com',
                createAuthors: true
            }
        };
        const response = processor.all(ctx);
        const posts = response.posts;

        assert.equal(posts.length, 2);

        const post = posts[0];

        assert.ok('url' in post);
        assert.ok('data' in post);

        assert.equal(post.url, 'https://example.com/p/lorem-ipsum');

        const data = post.data;

        assert.equal(data.slug, 'lorem-ipsum');
        assert.equal(data.title, 'Lorem ipsum');
        assert.equal(data.meta_title, 'Meta title lorem ipsum dolor sit amet consectetur adipiscing elit');
        assert.equal(data.meta_description, 'Meta description lorem ipsum dolor sit amet consectetur adipiscing elit');
        assert.equal(data.status, 'published');
        assert.equal(data.published_at, '2023-02-03T09:49:30.272Z');
        assert.equal(data.html, '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam eu risus metus. Etiam aliquet leo eget urna gravida, ac accumsan diam rutrum. Curabitur facilisis, nulla non lacinia dictum, urna sapien tincidunt diam, non elementum ante elit quis justo.</p><ul><li>Praesent vehicula libero nunc, in scelerisque nisl mattis facilisis</li><li>Praesent ornare velit vitae arcu tincidunt vulputate</li><li>Phasellus a nibh a tellus accumsan varius</li></ul><h2>Praesent felis augue, auctor aliquet dui ut</h2><p>Sollicitudin varius est. <a href="https://example.com/p/dolor-simet">Aenean</a> tincidunt eu tellus sit amet hendrerit.</p>');
        assert.equal(data.custom_excerpt, 'Lorem ipsum dolor sit amet consectetur adipiscing elit');
        assert.equal(data.feature_image, 'https://example.com/lorem-ipsum-cover.webp');

        const tags = data.tags;

        assert.equal(tags.length, 4);
        assert.equal(tags[0].url, '/tag/newsletter');
        assert.equal(tags[0].data.slug, 'newsletter');
        assert.equal(tags[0].data.name, 'Newsletter');
        assert.equal(tags[1].url, 'migrator-added-tag-lorem');
        assert.equal(tags[1].data.slug, 'lorem');
        assert.equal(tags[1].data.name, 'Lorem');
        assert.equal(tags[2].url, 'migrator-added-tag-ipsum');
        assert.equal(tags[2].data.slug, 'ipsum');
        assert.equal(tags[2].data.name, 'Ipsum');
        assert.equal(tags[3].url, 'migrator-added-tag');
        assert.equal(tags[3].data.slug, 'hash-letterdrop');
        assert.equal(tags[3].data.name, '#letterdrop');

        const authors = data.authors;

        assert.equal(authors.length, 1);
        assert.equal(authors[0].url, '/author/john-smith');
        assert.equal(authors[0].data.email, 'john-smith@example.com');
        assert.equal(authors[0].data.slug, 'john-smith');
        assert.equal(authors[0].data.name, 'John Smith');
    });

    it('Converts signup iframes to Portal links', function () {
        const ctx = {
            result: fixture,
            options: {
                url: 'https://example.com',
                addPrimaryTag: 'Newsletter',
                email: 'person@example.com',
                createAuthors: true,
                subscribeLink: '#/portal/signup',
                subscribeText: 'Subscribe'
            }
        };
        const response = processor.all(ctx);
        const posts = response.posts;

        const post = posts[1];

        assert.equal(post.data.html, '<div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div><div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div>');
    });
});
