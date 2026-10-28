import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {processContent} from '../index.js';
import type {CuratedIssue} from '../index.js';
import {issueFixture} from './helpers.js';

const imageSource = (filename: string) => `/content/images/12/${filename}`;

describe('processContent', function () {
    it('converts an issue to HTML', async function () {
        const html = processContent(await issueFixture(), imageSource);

        assert.equal(
            html,
            '<h2>News</h2><h3>Issue 12</h3><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam tempor justo in magna congue, id efficitur eros scelerisque. Integer sagittis pharetra orci, vitae vulputate ante semper vel.</p><p><i>Author Name, Article Site</i></p><hr><h3><a href="https://google.com">This is a search engine</a></h3><p>Curabitur faucibus, libero a pulvinar dignissim, justo est tincidunt arcu, eget rhoncus dolor felis eget enim. Morbi est nisi, porttitor eu magna ut, faucibus varius felis. Nam interdum suscipit dictum.</p><p><i><a href="https://google.com">google.com</a></i></p><h2>Learn</h2><h3><a href="https://example.com/article-title/">Aliquam nec malesuada purus - Author</a></h3><p>Quisque condimentum ultrices massa, vitae malesuada felis hendrerit ut.</p><p><i><a href="https://example.com/article-title/">example.com</a></i></p><hr><h3><a href="https://www.w3.org/">Proin euismod vitae mi ac porta</a></h3><p>Vivamus et molestie nisl. Nam dapibus odio sed mollis sollicitudin. Etiam malesuada urna quis porttitor aliquet.</p><p><i><a href="https://www.w3.org/">https://www.w3.org</a></i></p><h2>Our Sponsor</h2><!--kg-card-begin: html--><a class="kg-card kg-image-card" href="https://courses.example.com"><img class="kg-image" src="/content/images/12/a174e606-7a19-4c86-9f18-1c528a54643a.png" alt="Special offer!" /></a><!--kg-card-end: html--><h3><a href="https://courses.example.com">Special offer!</a></h3><p>Nullam blandit sodales scelerisque.</p><p><i><a href="https://courses.example.com">example.com</a></i></p>'
        );
    });

    it('shows a Text item image without a link when the item has no URL', function () {
        const html = processContent(
            {
                categories: [
                    {
                        name: 'Photos',
                        items: [{type: 'Text', title: 'A view', image_original_filename: 'view.jpg', footer: ''}]
                    }
                ]
            },
            imageSource
        );

        assert.equal(
            html,
            '<h2>Photos</h2><img src="/content/images/12/view.jpg" alt="A view" /><h3>A view</h3><p><i></i></p>'
        );
    });

    it('leaves out images without a source', function () {
        const seen: string[] = [];
        const html = processContent(
            {
                categories: [
                    {
                        name: 'Links',
                        items: [
                            {
                                type: 'Link',
                                title: 'Gone',
                                url: 'https://example.com',
                                image_original_filename: 'gone.png'
                            }
                        ]
                    }
                ]
            },
            filename => {
                seen.push(filename);
                return null;
            }
        );

        assert.deepEqual(seen, ['gone.png']);
        assert.equal(
            html,
            '<h2>Links</h2><h3><a href="https://example.com">Gone</a></h3><p><i><a href="https://example.com">undefined</a></i></p>'
        );
    });

    it('escapes attribute values and footer text', function () {
        const html = processContent(
            {
                categories: [
                    {
                        name: 'Quotes',
                        items: [
                            {
                                type: 'Text',
                                title: 'The "best" one',
                                url: 'https://example.com/?a=1&b="2"',
                                image_original_filename: 'quote.png',
                                description: '<p>Body</p>',
                                footer: '<p>Tom &amp; Jerry &lt;script&gt;</p>'
                            },
                            {type: 'Text', image_original_filename: 'untitled.png'}
                        ]
                    }
                ]
            },
            imageSource
        );

        assert.equal(
            html,
            '<h2>Quotes</h2><!--kg-card-begin: html--><a class="kg-card kg-image-card" href="https://example.com/?a=1&b=&quot;2&quot;"><img class="kg-image" src="/content/images/12/quote.png" alt="The &quot;best&quot; one" /></a><!--kg-card-end: html--><h3>The "best" one</h3><p>Body</p><p><i>Tom &amp; Jerry &lt;script&gt;</i></p><hr><img src="/content/images/12/untitled.png" alt="" /><h3>undefined</h3><p><i></i></p>'
        );
    });

    it('skips other item types and tolerates missing categories and items', function () {
        const issue: CuratedIssue = {
            categories: [{name: 'Empty'}, {name: 'Other', items: [{type: 'Video', title: 'Clip'}, {type: 'Embed'}]}]
        };

        assert.equal(processContent(issue, imageSource), '<h2>Empty</h2><h2>Other</h2><hr>');
        assert.equal(processContent({}, imageSource), '');
    });
});
