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
import fixtureSimple from './fixtures/Entry:1234.json';
import fixture from './fixtures/Entry:0969db64-b8d7-11ed-afa1-0242ac120001.json';

describe('Process', function () {
    test('Can convert a single post', function () {
        let options = {
            url: 'https://example.com',
            addPrimaryTag: 'Newsletter'
        };

        const post = processor.processPost({source: fixture}, options);

        expect(post).toHaveProperty('url');
        expect(post).toHaveProperty('data');

        expect(post.url).toEqual('https://example.com/2019/9/26/12345678/my-article');

        const data = post.data;

        expect(data.slug).toEqual('my-article');
        expect(data.title).toEqual('Example post title');
        expect(data.custom_excerpt).toEqual('My subtitle');
        expect(data.status).toEqual('published');
        expect(data.created_at).toEqual('2019-09-27T00:40:19.000Z');
        expect(data.updated_at).toEqual('2019-09-27T00:48:48.000Z');
        expect(data.published_at).toEqual('2019-09-27T00:40:19.000Z');
        // HTML is in another test

        const tags = data.tags;

        expect(tags).toBeArrayOfSize(5);

        expect(tags[0].url).toEqual('/tag/newsletter');
        expect(tags[0].data.slug).toEqual('newsletter');
        expect(tags[0].data.name).toEqual('Newsletter');

        expect(tags[1].url).toEqual('migrator-added-tag-lorem');
        expect(tags[1].data.slug).toEqual('lorem');
        expect(tags[1].data.name).toEqual('Lorem');

        expect(tags[2].url).toEqual('migrator-added-tag-ipsum-dolor');
        expect(tags[2].data.slug).toEqual('ipsum-dolor');
        expect(tags[2].data.name).toEqual('Ipsum Dolor');

        expect(tags[3].url).toEqual('migrator-added-tag-simet');
        expect(tags[3].data.slug).toEqual('simet');
        expect(tags[3].data.name).toEqual('Simet');

        expect(tags[4].url).toEqual('migrator-added-tag-hash-chorus');
        expect(tags[4].data.slug).toEqual('hash-chorus');
        expect(tags[4].data.name).toEqual('#chorus');

        const authors = data.authors;

        expect(authors).toBeArrayOfSize(2);

        expect(authors[0].url).toEqual('/author/author-name');
        expect(authors[0].data.email).toEqual('author-name@example.com');
        expect(authors[0].data.slug).toEqual('author-name');
        expect(authors[0].data.name).toEqual('Author Name');

        expect(authors[1].url).toEqual('/author/contributors-name');
        expect(authors[1].data.email).toEqual('contributors-name@example.com');
        expect(authors[1].data.slug).toEqual('contributors-name');
        expect(authors[1].data.name).toEqual('Contributors Name');
    });

    test('Can convert JSON to HTML', function () {
        let options = {
            url: 'https://example.com',
            addPrimaryTag: 'Newsletter'
        };

        const post = processor.processPost({source: fixtureSimple}, options);

        expect(post).toHaveProperty('url');
        expect(post).toHaveProperty('data');
        expect(post.data.html).toEqual('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In semper ligula tellus, eget euismod purus posuere sed.</p>');
    });
});

describe('JSON to HTML', function () {
    test('Can convert EntryBodyParagraph', function () {
        let block = fixture.body.components[0];
        let converted = EntryBodyParagraph(block);

        expect(converted).toEqual('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In semper ligula tellus, eget euismod purus posuere sed.</p>');
    });

    test('Can convert EntryBodyList (unordered)', function () {
        let block = fixture.body.components[1];
        let converted = EntryBodyList(block);

        expect(converted).toEqual('<ul><li>Nullam gravida commodo dignissim. Morbi non nulla porta, sagittis elit non</li><li>Morbi rhoncus vel sapien sed condimentum. In hac habitasse platea dictumst</li>/<ul>');
    });

    test('Can convert EntryBodyList (ordered)', function () {
        let block = fixture.body.components[2];
        let converted = EntryBodyList(block);
        expect(converted).toEqual('<ol><li>Nullam gravida commodo dignissim. Morbi non nulla porta, sagittis elit non</li><li>Morbi rhoncus vel sapien sed condimentum. In hac habitasse platea dictumst</li></ol>');
    });

    test('Can convert EntryBodyRelatedList', function () {
        let block = fixture.body.components[3];
        let converted = EntryBodyRelatedList(block);
        expect(converted).toEqual('<hr><h4>Related</h4><p><a href="https://example.com/2019/9/25/23456789/marius">Mauris nunc lacus, cursus ut semper id</a><br><a href="https://example.com/2019/9/25/33456789/Fermentum">Fermentum nec diam. Mauris at dapibus orci</a><br><a href="https://example.com/2019/9/26/43456789/vehicula">In vehicula vitae elit vel imperdiet</a></p><hr>');
    });

    test('Can convert EntryBodyHTML', function () {
        let block = fixture.body.components[4];
        let converted = EntryBodyHTML(block);
        expect(converted).toEqual('<!--kg-card-begin: html--><iframe frameborder="0" height="200" scrolling="no" src="https://example.com?v=1234" width="100%"></iframe><!--kg-card-end: html-->');
    });

    test('Can convert EntryBodyHeading', function () {
        let block = fixture.body.components[5];
        let converted = EntryBodyHeading(block);
        expect(converted).toEqual('<h2>A sub header!</h2>');
    });

    test('Can convert EntryBodyEmbed', function () {
        let block = fixture.body.components[6];
        let converted = EntryBodyEmbed(block);
        expect(converted).toEqual(`<!--kg-card-begin: html--><blockquote class="twitter-tweet"><p lang="en" dir="ltr">Want to work on open source full time, from anywhere in the world? We&#39;re hiring for new roles in product, front-end and back-end engineering! 👇<a href="https://t.co/T5U76vH0nJ">https://t.co/T5U76vH0nJ</a></p>&mdash; Ghost (@Ghost) <a href="https://twitter.com/Ghost/status/1570816009090789377?ref_src=twsrc%5Etfw">September 16, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
<!--kg-card-end: html-->`);
    });

    test('Can convert EntryBodyPullquote', function () {
        let block = fixture.body.components[7];
        let converted = EntryBodyPullquote(block);
        expect(converted).toEqual('<blockquote class="kg-blockquote-alt">“Try Ghost!”</blockquote>');
    });

    test('Can convert EntryBodyHorizontalRule', function () {
        let block = fixture.body.components[8];
        let converted = EntryBodyHorizontalRule(block);
        expect(converted).toEqual('<hr>');
    });

    test('Can convert EntryBodyBlockquote', function () {
        let block = fixture.body.components[9];
        let converted = EntryBodyBlockquote(block);
        expect(converted).toEqual('<blockuote><p>Lorem ipsum</p><p>Dolor simet</p></blockuote>');
    });

    test('Can convert EntryBodyPoll', function () {
        let block = fixture.body.components[10];
        let converted = EntryBodyPoll(block);
        expect(converted).toEqual('<h3>Who will win?</h3><!--kg-card-begin: html--><table><tbody><tr><td>Lorem</td><td>10</td></tr><tr><td>Ipsum</td><td>5</td></tr></tbody></table><!--kg-card-end: html-->');
    });

    test('Can convert EntryBodyTable', function () {
        let block = fixture.body.components[11];
        let converted = EntryBodyTable(block);
        expect(converted).toEqual('<h3>The beatles</h3><!--kg-card-begin: html--><table><thead><th>Name</th><th>Year of birth</th></thead><tbody><tr><td>John</td><td>Paul</td><td>George</td><td>Ringo</td></tr><tr><td>1940</td><td>1942</td><td>1943</td><td>1940</td></tr></tbody></table><!--kg-card-end: html-->');
    });
});
