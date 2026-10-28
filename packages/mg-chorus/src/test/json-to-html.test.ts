import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    jsonToHtml,
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
} from '../index.js';
import {entryFixture, FULL} from './helpers.js';

const fixture = await entryFixture(FULL);
const components = fixture.body!.components!;

describe('JSON to HTML', function () {
    it('Can convert EntryBodyParagraph', function () {
        let block = components[0];
        let converted = EntryBodyParagraph(block);

        assert.equal(
            converted,
            '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In semper ligula tellus, eget euismod purus posuere sed.</p>'
        );
    });

    it('Can convert EntryBodyList (unordered)', function () {
        let block = components[1];
        let converted = EntryBodyList(block);

        assert.equal(
            converted,
            '<ul><li>Nullam gravida commodo dignissim. Morbi non nulla porta, sagittis elit non</li><li>Morbi rhoncus vel sapien sed condimentum. In hac habitasse platea dictumst</li></ul>'
        );
    });

    it('Can convert EntryBodyList (ordered)', function () {
        let block = components[2];
        let converted = EntryBodyList(block);
        assert.equal(
            converted,
            '<ol><li>Nullam gravida commodo dignissim. Morbi non nulla porta, sagittis elit non</li><li>Morbi rhoncus vel sapien sed condimentum. In hac habitasse platea dictumst</li></ol>'
        );
    });

    it('Can convert EntryBodyRelatedList', function () {
        let block = components[3];
        let converted = EntryBodyRelatedList(block);
        assert.equal(
            converted,
            '<hr><h4>Related</h4><p><a href="https://example.com/2019/9/25/23456789/marius">Mauris nunc lacus, cursus ut semper id</a><br><a href="https://example.com/2019/9/25/33456789/Fermentum">Fermentum nec diam. Mauris at dapibus orci</a><br><a href="https://example.com/2019/9/26/43456789/vehicula">In vehicula vitae elit vel imperdiet</a></p><hr>'
        );
    });

    it('Can convert EntryBodyHTML', function () {
        let block = components[4];
        let converted = EntryBodyHTML(block);
        assert.equal(
            converted,
            '<!--kg-card-begin: html--><iframe frameborder="0" height="200" scrolling="no" src="https://example.com?v=1234" width="100%"></iframe><!--kg-card-end: html-->'
        );
    });

    it('Can convert EntryBodyHeading', function () {
        let block = components[5];
        let converted = EntryBodyHeading(block);
        assert.equal(converted, '<h2>A sub header!</h2>');
    });

    it('Removes every bold tag from EntryBodyHeading, leaving italics alone', function () {
        const converted = EntryBodyHeading({
            level: 3,
            contents: {html: '<strong>Bold</strong> and <b>bold</b> <em>italic</em>'}
        });
        assert.equal(converted, '<h3>Bold and bold <em>italic</em></h3>');
    });

    it('Can convert EntryBodyEmbed', function () {
        let block = components[6];
        let converted = EntryBodyEmbed(block);
        assert.equal(
            converted,
            `<!--kg-card-begin: html--><blockquote class="twitter-tweet"><p lang="en" dir="ltr">Want to work on open source full time, from anywhere in the world? We&#39;re hiring for new roles in product, front-end and back-end engineering! 👇<a href="https://t.co/T5U76vH0nJ">https://t.co/T5U76vH0nJ</a></p>&mdash; Ghost (@Ghost) <a href="https://twitter.com/Ghost/status/1570816009090789377?ref_src=twsrc%5Etfw">September 16, 2022</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
<!--kg-card-end: html-->`
        );
    });

    it('Can convert EntryBodyPullquote', function () {
        let block = components[7];
        let converted = EntryBodyPullquote(block);
        assert.equal(converted, '<blockquote class="kg-blockquote-alt">“Try Ghost!”</blockquote>');
    });

    it('Can convert EntryBodyHorizontalRule', function () {
        let converted = EntryBodyHorizontalRule();
        assert.equal(converted, '<hr>');
    });

    it('Can convert EntryBodyBlockquote', function () {
        let block = components[9];
        let converted = EntryBodyBlockquote(block);
        assert.equal(converted, '<blockquote><p>Lorem ipsum</p><p>Dolor simet</p></blockquote>');
    });

    it('Can convert EntryBodyPoll', function () {
        let block = components[10];
        let converted = EntryBodyPoll(block);
        assert.equal(
            converted,
            '<h3>Who will win?</h3><!--kg-card-begin: html--><table><tbody><tr><td>Lorem</td><td>10</td></tr><tr><td>Ipsum</td><td>5</td></tr></tbody></table><!--kg-card-end: html-->'
        );
    });

    it('Can convert EntryBodyPoll without a title', function () {
        const converted = EntryBodyPoll({poll: {options: [{label: 'Yes', votes: 1}]}});
        assert.equal(
            converted,
            '<!--kg-card-begin: html--><table><tbody><tr><td>Yes</td><td>1</td></tr></tbody></table><!--kg-card-end: html-->'
        );
    });

    it('Can convert EntryBodyTable', function () {
        let block = components[11];
        let converted = EntryBodyTable(block);
        assert.equal(
            converted,
            '<h3>The beatles</h3><!--kg-card-begin: html--><table><thead><th>Name</th><th>Year of birth</th></thead><tbody><tr><td>John</td><td>Paul</td><td>George</td><td>Ringo</td></tr><tr><td>1940</td><td>1942</td><td>1943</td><td>1940</td></tr></tbody></table><!--kg-card-end: html-->'
        );
    });

    it('Can convert EntryBodyTable without a title', function () {
        const converted = EntryBodyTable({table: {columns: ['A'], rows: [['1']]}});
        assert.equal(
            converted,
            '<!--kg-card-begin: html--><table><thead><th>A</th></thead><tbody><tr><td>1</td></tr></tbody></table><!--kg-card-end: html-->'
        );
    });

    it('Converts a body in order, leaving out images, galleries, sidebars and unknown blocks', function () {
        const html = jsonToHtml([
            components[5],
            {__typename: 'EntryBodyImage', image: {url: 'https://example.com/a.jpg'}},
            {__typename: 'EntryBodyGallery'},
            {__typename: 'EntryBodySidebar'},
            {__typename: 'EntryBodyUnknown'},
            {__typename: 'constructor'},
            {},
            components[8],
            components[0]
        ]);
        assert.equal(
            html,
            '<h2>A sub header!</h2><hr><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In semper ligula tellus, eget euismod purus posuere sed.</p>'
        );
    });

    it('Converts every block of the fixture', function () {
        const html = jsonToHtml(components);
        assert.ok(html.startsWith('<p>Lorem ipsum dolor sit amet'));
        assert.ok(html.endsWith('</table><!--kg-card-end: html-->'));
        assert.equal(html.match(/<hr>/g)!.length, 3);
    });

    it('Converts a missing body to empty HTML', function () {
        assert.equal(jsonToHtml(undefined), '');
        assert.equal(jsonToHtml(null), '');
        assert.equal(jsonToHtml([]), '');
    });
});
