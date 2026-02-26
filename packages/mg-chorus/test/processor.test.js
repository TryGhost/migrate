import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import processor from '../lib/processor.js';
import {
    EntryBodyList,
    EntryBodyParagraph,
    EntryBodyEmbed,
    EntryBodyHeading,
    EntryBodyHTML,
    EntryBodyPoll,
    EntryBodyPullquote,
    EntryBodyTable,
    EntryBodyBlockquote,
    EntryBodyHorizontalRule,
    EntryBodyRelatedList
} from '../lib/json-to-html.js';

const require = createRequire(import.meta.url);
const fixtureSimple = require('./fixtures/Entry:1234.json');
const fixture = require('./fixtures/Entry:0969db64-b8d7-11ed-afa1-0242ac120001.json');

describe('Process', function () {
    it('Can convert a single post', function () {
        let options = {
            url: 'https://example.com',
            addPrimaryTag: 'Newsletter'
        };

        const post = processor.processPost({source: fixture}, options);

        assert.ok('url' in post);
        assert.ok('data' in post);

        assert.equal(post.url, 'https://example.com/2019/9/26/12345678/my-article');

        const data = post.data;

        assert.equal(data.slug, 'my-article');
        assert.equal(data.title, 'Example post title');
        assert.equal(data.custom_excerpt, 'My subtitle');
        assert.equal(data.status, 'published');
        assert.equal(data.created_at, '2019-09-27T00:40:19.000Z');
        assert.equal(data.updated_at, '2019-09-27T00:48:48.000Z');
        assert.equal(data.published_at, '2019-09-27T00:40:19.000Z');
        // HTML is in another test

        const tags = data.tags;

        assert.equal(tags.length, 5);

        assert.equal(tags[0].url, '/tag/newsletter');
        assert.equal(tags[0].data.slug, 'newsletter');
        assert.equal(tags[0].data.name, 'Newsletter');

        assert.equal(tags[1].url, 'migrator-added-tag-lorem');
        assert.equal(tags[1].data.slug, 'lorem');
        assert.equal(tags[1].data.name, 'Lorem');

        assert.equal(tags[2].url, 'migrator-added-tag-ipsum-dolor');
        assert.equal(tags[2].data.slug, 'ipsum-dolor');
        assert.equal(tags[2].data.name, 'Ipsum Dolor');

        assert.equal(tags[3].url, 'migrator-added-tag-simet');
        assert.equal(tags[3].data.slug, 'simet');
        assert.equal(tags[3].data.name, 'Simet');

        assert.equal(tags[4].url, 'migrator-added-tag-hash-chorus');
        assert.equal(tags[4].data.slug, 'hash-chorus');
        assert.equal(tags[4].data.name, '#chorus');

        const authors = data.authors;

        assert.equal(authors.length, 3);

        assert.equal(authors[0].url, '/author/main-author-name');
        assert.equal(authors[0].data.email, 'main-author-name@example.com');
        assert.equal(authors[0].data.slug, 'main-author-name');
        assert.equal(authors[0].data.name, 'Main Author Name');

        assert.equal(authors[1].url, '/author/author-name');
        assert.equal(authors[1].data.email, 'author-name@example.com');
        assert.equal(authors[1].data.slug, 'author-name');
        assert.equal(authors[1].data.name, 'Author Name');

        assert.equal(authors[2].url, '/author/contributors-name');
        assert.equal(authors[2].data.email, 'contributors-name@example.com');
        assert.equal(authors[2].data.slug, 'contributors-name');
        assert.equal(authors[2].data.name, 'Contributors Name');
    });

    it('Can convert JSON to HTML', function () {
        let options = {
            url: 'https://example.com',
            addPrimaryTag: 'Newsletter'
        };

        const post = processor.processPost({source: fixtureSimple}, options);

        assert.ok('url' in post);
        assert.ok('data' in post);
        assert.equal(post.data.html, '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In semper ligula tellus, eget euismod purus posuere sed.</p>');
    });
});

describe('JSON to HTML', function () {
    it('Can convert EntryBodyParagraph', function () {
        let block = fixture.body.components[0];
        let converted = EntryBodyParagraph(block);

        assert.equal(converted, '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In semper ligula tellus, eget euismod purus posuere sed.</p>');
    });

    it('Can convert EntryBodyList (unordered)', function () {
        let block = fixture.body.components[1];
        let converted = EntryBodyList(block);

        assert.equal(converted, '<ul><li>Nullam gravida commodo dignissim. Morbi non nulla porta, sagittis elit non</li><li>Morbi rhoncus vel sapien sed condimentum. In hac habitasse platea dictumst</li>/<ul>');
    });

    it('Can convert EntryBodyList (ordered)', function () {
        let block = fixture.body.components[2];
        let converted = EntryBodyList(block);
        assert.equal(converted, '<ol><li>Nullam gravida commodo dignissim. Morbi non nulla porta, sagittis elit non</li><li>Morbi rhoncus vel sapien sed condimentum. In hac habitasse platea dictumst</li></ol>');
    });

    it('Can convert EntryBodyRelatedList', function () {
        let block = fixture.body.components[3];
        let converted = EntryBodyRelatedList(block);
        assert.equal(converted, '<hr><h4>Related</h4><p><a href="https://example.com/2019/9/25/23456789/marius">Mauris nunc lacus, cursus ut semper id</a><br><a href="https://example.com/2019/9/25/33456789/Fermentum">Fermentum nec diam. Mauris at dapibus orci</a><br><a href="https://example.com/2019/9/26/43456789/vehicula">In vehicula vitae elit vel imperdiet</a></p><hr>');
    });

    it('Can convert EntryBodyHTML', function () {
        let block = fixture.body.components[4];
        let converted = EntryBodyHTML(block);
        assert.equal(converted, '<!--kg-card-begin: html--><iframe frameborder="0" height="200" scrolling="no" src="https://example.com?v=1234" width="100%"></iframe><!--kg-card-end: html-->');
    });

    it('Can convert EntryBodyHeading', function () {
        let block = fixture.body.components[5];
        let converted = EntryBodyHeading(block);
        assert.equal(converted, '<h2>A sub header!</h2>');
    });

    it('Can convert EntryBodyEmbed', function () {
        let block = fixture.body.components[6];
        let converted = EntryBodyEmbed(block);
        assert.equal(converted, `<!--kg-card-begin: html--><blockquote class="twitter-tweet"><p lang="en" dir="ltr">Want to work on open source full time, from anywhere in the world? We&#39;re hiring for new roles in product, front-end and back-end engineering! \u{1F447}<a href="https://t.co/T5U76vH0nJ">https://t.co/T5U76vH0nJ</a></p>&mdash; Ghost (@Ghost) <a href="https://twitter.com/Ghost/status/1570816009090789377?ref_src=twsrc%5Etfw">September 16, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
<!--kg-card-end: html-->`);
    });

    it('Can convert EntryBodyPullquote', function () {
        let block = fixture.body.components[7];
        let converted = EntryBodyPullquote(block);
        assert.equal(converted, '<blockquote class="kg-blockquote-alt">\u201CTry Ghost!\u201D</blockquote>');
    });

    it('Can convert EntryBodyHorizontalRule', function () {
        let block = fixture.body.components[8];
        let converted = EntryBodyHorizontalRule(block);
        assert.equal(converted, '<hr>');
    });

    it('Can convert EntryBodyBlockquote', function () {
        let block = fixture.body.components[9];
        let converted = EntryBodyBlockquote(block);
        assert.equal(converted, '<blockuote><p>Lorem ipsum</p><p>Dolor simet</p></blockuote>');
    });

    it('Can convert EntryBodyPoll', function () {
        let block = fixture.body.components[10];
        let converted = EntryBodyPoll(block);
        assert.equal(converted, '<h3>Who will win?</h3><!--kg-card-begin: html--><table><tbody><tr><td>Lorem</td><td>10</td></tr><tr><td>Ipsum</td><td>5</td></tr></tbody></table><!--kg-card-end: html-->');
    });

    it('Can convert EntryBodyTable', function () {
        let block = fixture.body.components[11];
        let converted = EntryBodyTable(block);
        assert.equal(converted, '<h3>The beatles</h3><!--kg-card-begin: html--><table><thead><th>Name</th><th>Year of birth</th></thead><tbody><tr><td>John</td><td>Paul</td><td>George</td><td>Ringo</td></tr><tr><td>1940</td><td>1942</td><td>1943</td><td>1940</td></tr></tbody></table><!--kg-card-end: html-->');
    });
});
