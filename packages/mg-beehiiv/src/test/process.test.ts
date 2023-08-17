import assert from 'node:assert/strict';
import {getYouTubeID, processHTML, removeDuplicateFeatureImage} from '../lib/process.js';

const mappedObject: mappedDataObject = {
    url: 'https://example.beehiiv.com/p/lorem-ipsum',
    data: {
        slug: '',
        published_at: '',
        updated_at: '',
        created_at: '',
        title: 'Example Post',
        type: '',
        html: '',
        status: 'published',
        custom_excerpt: '',
        visibility: 'public',
        tags: []
    }
};

describe('Beehiiv Processor', () => {
    describe('YouTube ID Extractor', () => {
        it('Full URL', () => {
            const id = getYouTubeID('https://youtube.com/watch?v=1234ABCD123');
            assert.equal(id, '1234ABCD123');
        });

        it('Short URL', () => {
            const id = getYouTubeID('https://youtu.be/1234ABCD123');
            assert.equal(id, '1234ABCD123');
        });

        it('Embed URL', () => {
            const id = getYouTubeID('https://www.youtube.com/embed/1234ABCD123');
            assert.equal(id, '1234ABCD123');
        });

        it('ID only', () => {
            const id = getYouTubeID('1234ABCD123');
            assert.equal(id, '1234ABCD123');
        });
    });

    describe('Process Beehiiv Post Content', () => {
        it('Can return basic HTML', () => {
            const processed = processHTML({html: '<body><p>Hello</p></body>', options: {}});
            assert.equal(processed, '<p>Hello</p>');
        });

        // Remove hidden elements
        it('Remove hidden elements', () => {
            const htmlContent = `<body><div style="display:none">Hide 1</div><div style="display: none">Hide 2</div><div style="display: none ">Hide 3</div><div style="display: none;">Hide 4</div><div style="display:none; color: red;">Hide 5</div><p>Visible</p></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {}});

            assert.equal(processed, '<p>Visible</p>');
        });

        // Remove the share links at the top
        it('Remove the share links at the top', () => {
            const htmlContent = `<body><table class="mob-block"><tr><td>Big bunch of links</td></tr></table><p>Real content</p></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {}});

            assert.equal(processed, '<p>Real content</p>');
        });

        // Remove the open tracking pixel element
        it('Remove the open tracking pixel element', () => {
            const htmlContent = `<body><table><tr><td style="height:0px;width:0px;"><div style="height:1px;" data-open-tracking="true"> {{OPEN_TRACKING_PIXEL}} </div></td></tr></table><p>Real content</p></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {}});

            assert.equal(processed, '<p>Real content</p>');
        });

        // Remove unsubscribe links, social links, & email footer
        it('Remove unsubscribe links, social links, & email footer', () => {
            const htmlContent = `<body><table><tr><td class="b">Big bunch of links</td></tr></table><p>Real content</p></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {}});

            assert.equal(processed, '<p>Real content</p>');
        });

        // Remove the 'Read online' link
        it('Remove the "Read online" link', () => {
            const htmlContent = `<body><table><tr><td class="f"><p> July 10, 2023 &nbsp; | &nbsp; <a href="https://example.beehiiv.com/p/news-premium-subscribers">Read Online</a></p></td></tr></table><p>Real content</p></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {}});

            assert.equal(processed, '<p>Real content</p>');
        });

        // Remove the post title container, otherwise it would be a duplicate
        it('Remove the post title container', () => {
            const htmlContent = `<body><table>
                    <tr>
                        <td align="center" valign="top">
                            <h1>Example Post </h1>
                            <p>An example subheader</p>
                        </td>
                    </tr>
                </table>
                <p>Real content</p>
            </body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {}});

            assert.equal(processed, '<p>Real content</p>');
        });

        // Convert '...' to <hr />
        it('Convert ... to <hr />', () => {
            const htmlContent = `<body><p>...</p><p>…</p><p>&hellip;</p></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {}});

            assert.equal(processed, '<hr /><hr /><hr />');
        });

        it('Converts YouTube links to embeds with no caption', () => {
            const htmlContent = `<body>
                <a href="https://youtube.com/watch?v=1234ABCD123">
                    <table>
                        <tr>
                            <td>
                                <table>
                                    <tr>
                                        <td>
                                            <div>
                                                <div>
                                                    <img src="https://media.beehiiv.com/cdn-cgi/image/fit=scale-down,format=auto,onerror=redirect,quality=80/static_assets/youtube_play_icon.png" />
                                                </div>
                                            </div>
                                            <img src=" https://i.ytimg.com/vi/Ay043v5Hhho/maxresdefault.jpg" />
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </a>
                <p><a href="https://youtube.com/watch?v=1234ABCD123">Regular YouTube link</a></p>
            </body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {}});

            assert.equal(processed, `<figure class="kg-card kg-embed-card"><iframe src="https://www.youtube.com/embed/1234ABCD123?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></figure>
                <p><a href="https://youtube.com/watch?v=1234ABCD123">Regular YouTube link</a></p>`);
        });

        it('Converts YouTube links to embeds with caption', () => {
            const htmlContent = `<body>
                <a href="https://youtube.com/watch?v=1234ABCD123">
                    <table>
                        <tr>
                            <td>
                                <table>
                                    <tr>
                                        <td>
                                            <div>
                                                <div>
                                                    <img src="https://media.beehiiv.com/cdn-cgi/image/fit=scale-down,format=auto,onerror=redirect,quality=80/static_assets/youtube_play_icon.png" />
                                                </div>
                                            </div>
                                            <img src=" https://i.ytimg.com/vi/Ay043v5Hhho/maxresdefault.jpg" />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p>Example YouTube caption. Watch <a href="https://youtube.com/watch?v=1234ABCD123">here</a></p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </a>
                <p><a href="https://youtube.com/watch?v=1234ABCD123">Regular YouTube link</a></p>
            </body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {}});

            assert.equal(processed, `<figure class="kg-card kg-embed-card kg-card-hascaption"><iframe src="https://www.youtube.com/embed/1234ABCD123?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen title="Example YouTube caption. Watch here"><figcaption>Example YouTube caption. Watch <a href="https://youtube.com/watch?v=1234ABCD123">here</a></figcaption></iframe></figure>
                <p><a href="https://youtube.com/watch?v=1234ABCD123">Regular YouTube link</a></p>`);
        });

        it('Updates subscribe links', () => {
            const htmlContent = `<body><p>Stay updated! Be sure to <a class="link" href="https://example.beehiiv.com/subscribe?utm_source=example.beehiiv.com&utm_medium=newsletter" target="_blank" rel="noopener noreferrer nofollow">subscribe to our newsletter</a>.</p></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {
                url: 'https://example.beehiiv.com',
                subscribeLink: '#/portal/signup'
            }});

            assert.equal(processed, '<p>Stay updated! Be sure to <a href="#/portal/signup">subscribe to our newsletter</a>.</p>');
        });
    });

    describe('Feature image deduplication', () => {
        it('Can return basic HTML', () => {
            const newHtml = removeDuplicateFeatureImage({
                html: '<p>Hi</p>',
                featureSrc: ''
            });

            assert.equal(newHtml, '<p>Hi</p>');
        });

        it('Does remove first image if it is a match', () => {
            const newHtml = removeDuplicateFeatureImage({
                html: '<img src="https://example.com/the-target.png" /><p>Hi</p>',
                featureSrc: 'https://example.com/the-target.png'
            });

            assert.equal(newHtml, '<p>Hi</p>');
        });

        it('Does remove first image if it is a match 2', () => {
            const newHtml = removeDuplicateFeatureImage({
                html: '<figure><img src="https://example.com/the-target.png" /></figure><p>Hi</p>',
                featureSrc: 'https://example.com/the-target.png'
            });

            assert.equal(newHtml, '<figure/><p>Hi</p>');
        });

        it('Does remove first image if it is a match 3', () => {
            const newHtml = removeDuplicateFeatureImage({
                html: '<div><figure><img src="https://example.com/the-target.png" /></figure></div><p>Hi</p>',
                featureSrc: 'https://example.com/the-target.png'
            });

            assert.equal(newHtml, '<div><figure/></div><p>Hi</p>');
        });

        it('Does remove first image if it is a match 4', () => {
            const newHtml = removeDuplicateFeatureImage({
                html: '<div><figure><img src="https://media.beehiiv.com/cdn-cgi/image/fit=scale-down,format=auto,onerror=redirect,quality=80/uploads/asset/file/12345678/image.png" /></figure></div><p>Hi</p>',
                featureSrc: 'https://media.beehiiv.com/cdn-cgi/image/quality=100/uploads/asset/file/12345678/image.png'
            });

            assert.equal(newHtml, '<div><figure/></div><p>Hi</p>');
        });

        it('Does not remove first image if is not a match', () => {
            const newHtml = removeDuplicateFeatureImage({
                html: '<img src="https://example.com/not-a-match.png" /><p>Hi</p>',
                featureSrc: 'https://example.com/the-target.png'
            });

            assert.equal(newHtml, '<img src="https://example.com/not-a-match.png"/><p>Hi</p>');
        });
    });
});
