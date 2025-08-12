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

describe('beehiiv Processor', () => {
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

    describe('Process beehiiv Post Content', () => {
        it('Can return basic HTML', () => {
            const processed = processHTML({html: '<table><tr id="content-blocks"><p>Hello</p></tr></table>'});
            assert.equal(processed, '<p>Hello</p>');
        });

        it('Can remove empty p tags', () => {
            const processed = processHTML({html: '<table><tr id="content-blocks"><p>Hello</p><p></p></tr></table>'});
            assert.equal(processed, '<p>Hello</p>');
        });

        it('Can remove empty figure tags', () => {
            const processed = processHTML({html: '<table><tr id="content-blocks"><figure class="kg-card" /><p>Hello</p></tr></table>'});
            assert.equal(processed, '<p>Hello</p>');
        });

        it('Can remove strong & bold tags from headers', () => {
            const processedH1 = processHTML({html: '<table><tr id="content-blocks"><h2><strong>Hello</strong> <b>Happy</b> World</h2></tr></table>'});
            assert.equal(processedH1, '<h2>Hello Happy World</h2>');

            const processedH2 = processHTML({html: '<table><tr id="content-blocks"><h2><strong>Hello</strong> <b>Happy</b> World</h2></tr></table>'});
            assert.equal(processedH2, '<h2>Hello Happy World</h2>');

            const processedH3 = processHTML({html: '<table><tr id="content-blocks"><h3><strong>Hello</strong> <b>Happy</b> World</h3></tr></table>'});
            assert.equal(processedH3, '<h3>Hello Happy World</h3>');

            const processedH4 = processHTML({html: '<table><tr id="content-blocks"><h4><strong>Hello</strong> <b>Happy</b> World</h4></tr></table>'});
            assert.equal(processedH4, '<h4>Hello Happy World</h4>');

            const processedH5 = processHTML({html: '<table><tr id="content-blocks"><h5><strong>Hello</strong> <b>Happy</b> World</h5></tr></table>'});
            assert.equal(processedH5, '<h5>Hello Happy World</h5>');

            const processedH6 = processHTML({html: '<table><tr id="content-blocks"><h6><strong>Hello</strong> <b>Happy</b> World</h6></tr></table>'});
            assert.equal(processedH6, '<h6>Hello Happy World</h6>');
        });

        it('Can convert HRs', () => {
            const processed = processHTML({html: '<table><tr id="content-blocks"><td align="center" valign="top" style="font-size:0px;line-height:0px;padding:20px 0px;" class="dd"><table class="j" role="none" width="50%" border="0" cellspacing="0" cellpadding="0" align="center"><tr><td> &nbsp; </td></tr></table></td><p>Hello</p></tr></table>'});
            assert.equal(processed, '<hr /><p>Hello</p>');
        });

        it('Can remove empty cells', () => {
            const processed = processHTML({html: '<table><tr id="content-blocks"><td align="center" valign="top" style="font-size:0px;line-height:0px;padding:20px 0px;" class="dd"><table role="none" width="50%" border="0" cellspacing="0" cellpadding="0" align="center"><tr><td> &nbsp; </td></tr></table></td><p>Hello</p></tr></table>'});
            assert.equal(processed, '<p>Hello</p>');
        });

        // Remove hidden elements
        it('Remove hidden elements', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><div style="display:none">Hide 1</div><div style="display: none">Hide 2</div><div style="display: none ">Hide 3</div><div style="display: none;">Hide 4</div><div style="display:none; color: red;">Hide 5</div><p>Visible</p></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<p>Visible</p>');
        });

        // Remove the share links at the top
        it('Remove the share links at the top', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><table class="mob-block"><tr><td>Big bunch of links</td></tr></table><p>Real content</p></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<p>Real content</p>');
        });

        // Remove the open tracking pixel element
        it('Remove the open tracking pixel element', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><table><tr><td style="height:0px;width:0px;"><div style="height:1px;" data-open-tracking="true"> {{OPEN_TRACKING_PIXEL}} </div></td></tr></table><p>Real content</p></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<p>Real content</p>');
        });

        // Remove unsubscribe links, social links, & email footer
        it('Remove unsubscribe links, social links, & email footer', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><table><tr><td class="b">Big bunch of links</td></tr></table><p>Real content</p></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<p>Real content</p>');
        });

        // Remove the 'Read online' link
        it('Remove the "Read online" link', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><table><tr><td class="f"><p> July 10, 2023 &nbsp; | &nbsp; <a href="https://example.beehiiv.com/p/news-premium-subscribers">Read Online</a></p></td></tr></table><p>Real content</p></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<p>Real content</p>');
        });

        // Remove the post title container, otherwise it would be a duplicate
        it('Remove the post title container', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><td><table>
                    <tr>
                        <td align="center" valign="top">
                            <h1> Example Post </h1>
                            <p>An example subheader</p>
                        </td>
                    </tr>
                </table>
                <p>Real content</p>
            </td></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<p>Real content</p>');
        });

        // Convert '...' to <hr />
        it('Convert ... to <hr />', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><p>...</p><p>…</p><p>&hellip;</p></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<hr /><hr /><hr />');
        });

        it('Converts YouTube links to embeds with no caption', () => {
            const htmlContent = `<body><table><tr id="content-blocks">
                <a href="https://youtu.be/1234ABCD123">
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
                <p><a href="https://youtu.be/1234ABCD123">Regular YouTube link</a></p>
            </tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<figure class="kg-card kg-embed-card"><iframe src="https://www.youtube.com/embed/1234ABCD123?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen width="160" height="90"></iframe></figure>\n' +
          '                <p><a href="https://youtu.be/1234ABCD123">Regular YouTube link</a></p>');
        });

        it('Converts YouTube links to embeds with caption', () => {
            const htmlContent = `<body><table><tr id="content-blocks">
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
            </tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<figure class="kg-card kg-embed-card kg-card-hascaption"><iframe src="https://www.youtube.com/embed/1234ABCD123?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen width="160" height="90"><figcaption>Example YouTube caption. Watch <a href="https://youtube.com/watch?v=1234ABCD123">here</a></figcaption></iframe></figure>\n' +
          '                <p><a href="https://youtube.com/watch?v=1234ABCD123">Regular YouTube link</a></p>');
        });

        it('Converts bookmarks', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><td><tr>
    <td align="center" valign="top" style="padding:14px 19px 14px 19px;" class="dd"><a href="https://example.com/p/hello-world" style="text-decoration:none;" target="_blank">
            <table role="none" width="100%" border="0" cellspacing="0" cellpadding="0" align="center">
                <tr>
                    <td align="center" valign="top" class="o" style="padding:12px 12px;">
                        <table role="none" border="0" cellspacing="0" cellpadding="0" align="right" width="100%">
                            <tr><!--[if mso]><td width="0"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="display:none;"><tr><![endif]-->
                                <td class="embed-img mob-stack" align="center" valign="top" style="width:35%;min-height:100px;vertical-align:middle;display:none;"><a href="https://example.com/p/hello-world" style="text-decoration:none;" target="_blank"><img src="https://beehiiv-images-production.s3.amazonaws.com/uploads/asset/file/12345678-1234-1234-92a5-d51e635d588c/photo.jpg?t=1723045443" width="100%" style="display:block;" /></a></td><!--[if mso]></tr></table></td><![endif]-->
                            </tr>
                            <tr>
                                <td align="center" valign="top" class="cc">
                                    <table role="none" width="100%" border="0" cellspacing="0" cellpadding="0" align="center">
                                        <tr>
                                            <td align="left" valign="top" class="l">
                                                <p>Hello world</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td align="left" valign="top" class="m">
                                                <p>And other text</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td align="left" valign="bottom" class="n" style="vertical-align:bottom;padding-top:12px;">
                                                <p style="word-break:break-word;">example.com/p/hello-world</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td><!--[if mso]><td width="0"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="display:none;"><tr><![endif]-->
                                <td class="mob-hide" align="center" valign="top" style="width:35%;min-height:100px;padding:0px 0px 0px 12px;vertical-align:middle;"><img src="https://beehiiv-images-production.s3.amazonaws.com/uploads/asset/file/12345678-1234-1234-92a5-d51e635d588c/photo.jpg?t=1723045443" width="100%" style="display:block;" /></td><!--[if mso]></tr></table></td><![endif]-->
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </a></td>
</tr></td></tr></table></body>`;

            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {
                url: 'https://example.beehiiv.com'
            }});

            assert.equal(processed, '<figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://example.com/p/hello-world"><div class="kg-bookmark-content"><div class="kg-bookmark-title">Hello world</div><div class="kg-bookmark-description">And other text</div><div class="kg-bookmark-metadata"></div><div class="kg-bookmark-thumbnail"><img src="https://beehiiv-images-production.s3.amazonaws.com/uploads/asset/file/12345678-1234-1234-92a5-d51e635d588c/photo.jpg?t=1723045443" alt="" /></div></div></a></figure>');
        });

        it('Updates subscribe links', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><p>Stay updated! Be sure to <a class="link" href="https://example.beehiiv.com/subscribe?utm_source=example.beehiiv.com&utm_medium=newsletter" target="_blank" rel="noopener noreferrer nofollow">subscribe to our newsletter</a>.</p></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {
                url: 'https://example.beehiiv.com',
                subscribeLink: '#/portal/signup'
            }});

            assert.equal(processed, '<p>Stay updated! Be sure to <a href="#/portal/signup">subscribe to our newsletter</a>.</p>');
        });

        it('Updates comment links', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><p>Hello <a href="https://example.beehiiv.com/p/post-slug?comments=true">Make a comment</a></p></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {
                url: 'https://example.beehiiv.com',
                comments: true,
                commentLink: '#ghost-comments-root'
            }});

            assert.equal(processed, '<p>Hello <a href="#ghost-comments-root">Make a comment</a></p>');
        });

        it('Removes comment links', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><p>Hello <a href="https://example.beehiiv.com/p/post-slug?comments=true">Make a comment</a></p></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {
                url: 'https://example.beehiiv.com',
                comments: false
            }});

            assert.equal(processed, '<p>Hello </p>');
        });

        it('Wraps images in figure tags with alt text', () => {
            const htmlContent = `<body><table><tr id="content-blocks">
            <td>
                <table>
                    <tr>
                        <td><img src="https://example.com/image.jpg" alt="My alt text" /></td>
                    </tr>
                </table>
            </td>
        </tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<figure class="kg-card kg-image-card"><img src="https://example.com/image.jpg" class="kg-image" alt="My alt text" /></figure>');
        });

        it('Skips wrapping images in figure tags if already a figure', () => {
            const htmlContent = `<body><table><tr id="content-blocks">
            <td>
                <table>
                    <tr>
                        <td><figure><img src="https://example.com/image.jpg" alt="My alt text" /></figure></td>
                    </tr>
                </table>
            </td>
        </tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.match(processed, /<figure><img src="https:\/\/example.com\/image.jpg" alt="My alt text" \/><\/figure>/);
        });

        it('Wraps images in figure tags and use caption as alt text', () => {
            const htmlContent = `<body><table><tr id="content-blocks">
            <td>
                <table>
                    <tr>
                        <td><img src="https://example.com/image.jpg" /></td>
                    </tr>
                    <tr>
                        <td align="center" valign="top" class="t" style="width:610px;">
                            <p>Image caption</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://example.com/image.jpg" class="kg-image" alt="Image caption" /><figcaption>Image caption</figcaption></figure>');
        });

        it('Wraps images in figure tags with caption', () => {
            const htmlContent = `<body><table><tr id="content-blocks">
            <td>
                <table>
                    <tr>
                        <td><img src="https://example.com/image.jpg" alt="My alt text" /></td>
                    </tr>
                    <tr>
                        <td align="center" valign="top" class="t" style="width:610px;">
                            <p>Image caption</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://example.com/image.jpg" class="kg-image" alt="My alt text" /><figcaption>Image caption</figcaption></figure>');
        });

        it('Wraps images in figure tags with missing caption text', () => {
            const htmlContent = `<body><table><tr id="content-blocks">
            <td>
                <table>
                    <tr>
                        <td><img src="https://example.com/image.jpg" alt="My alt text" /></td>
                    </tr>
                    <tr></tr>
                </table>
            </td>
        </tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<figure class="kg-card kg-image-card"><img src="https://example.com/image.jpg" class="kg-image" alt="My alt text" /></figure>');
        });

        it('Keeps images with wrapping links', () => {
            const htmlContent = `<body><table><tr id="content-blocks">
            <td>
                <table">
                    <tr>
                        <td>
                            <table>
                                <tr>
                                    <td class="dd">
                                        <table>
                                            <tr>
                                                <td>
                                                    <a href="https://example.com/destination" rel="noopener noreferrer nofollow" style="text-decoration:none;" target="_blank">
                                                        <img src="https://example.com/image.jpg" alt="" />
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<figure class="kg-card kg-image-card"><a href="https://example.com/destination"><img src="https://example.com/image.jpg" class="kg-image" alt="" /></a></figure>');
        });

        it('Converts galleries with captions to figures with figcaptions', () => {
            const htmlContent = `<body><table><tr id="content-blocks">
                <td width="100%">
                    <table class="mob-w-full">
                        <tr>
                            <td class="mob-stack">
                                <table>
                                    <tbody>
                                        <tr>
                                            <td>
                                                <table>
                                                    <tr>
                                                        <td>
                                                            <img src="https://example.com/image1.jpg" alt="" height="auto" width="210" />
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <p>Caption one</p>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                            <td class="mob-stack">
                                <table>
                                    <tbody>
                                        <tr>
                                            <td>
                                                <table>
                                                    <tr>
                                                        <td>
                                                            <img src="https://example.com/image2.jpg" alt="" height="auto" width="220" />
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <p>Caption 2</p>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                            <td class="mob-stack">
                                <table>
                                    <tbody>
                                        <tr>
                                            <td>
                                                <table>
                                                    <tr>
                                                        <td>
                                                            <img src="https://example.com/image3.jpg" alt="" height="auto" width="230" />
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <p></p>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://example.com/image1.jpg" class="kg-image" alt="" /><figcaption>Caption one</figcaption></figure><figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://example.com/image2.jpg" class="kg-image" alt="" /><figcaption>Caption 2</figcaption></figure><figure class="kg-card kg-image-card"><img src="https://example.com/image3.jpg" class="kg-image" alt="" /></figure>');
        });

        it('Keep buttons as buttons', () => {
            const htmlContent = `<body><table><tr id="content-blocks">
            <td align="center" valign="top" style="padding-bottom:14px;padding-left:25px;padding-right:25px;padding-top:14px;text-align:center;width:100%;word-break:break-word;" class="dd">
                <table role="none" border="0" cellspacing="0" cellpadding="0" align="center">
                    <tr>
                        <td class="v" align="center" valign="middle" height="42" style="height:42px;"><a href="https://www.example.com/upgrade" target="_blank" rel="noopener noreferrer nofollow" style="color:#FFFFFF;font-size:18px;padding:0px 14px;text-decoration:none;">Upgrade</a></td>
                    </tr>
                </table>
            </td>
        </tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject});

            assert.equal(processed, '<div class="kg-card kg-button-card kg-align-center"><a href="https://www.example.com/upgrade" class="kg-btn kg-btn-accent">Upgrade</a></div>');
        });

        it('Removes UTM params from internal URLs', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><a href="https://www.example.com/p/post-slug?utm_source=www.example.com&utm_medium=newsletter&utm_campaign=lorem-ipsum-dolor-simet-1234&last_resource_guid=Post%3Aabcd1234-c74e-427a-83f3-3f8c0bad81e6">Article</a></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {
                url: 'https://www.example.com'
            }});

            assert.equal(processed, '<a href="https://www.example.com/p/post-slug">Article</a>');
        });

        it('Does not remove non-UTM params from internal URLs', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><a href="https://www.example.com/upgrade?hello=world">Upgrade</a></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {
                url: 'https://www.example.com'
            }});

            assert.equal(processed, '<a href="https://www.example.com/upgrade?hello=world">Upgrade</a>');
        });

        it('Removes URL params from external URLs', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><a href="https://www.another.com/p/another-post-slug?utm_source=www.another.com&utm_medium=newsletter&utm_campaign=lorem-ipsum-dolor-simet-1234&last_resource_guid=Post%3Aabcd1234-c74e-427a-83f3-3f8c0bad81e6">Another Article</a></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {
                url: 'https://www.example.com'
            }});

            assert.equal(processed, '<a href="https://www.another.com/p/another-post-slug">Another Article</a>');
        });

        it('Skips empty URLs', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><a>Upgrade</a></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {
                url: 'https://www.example.com'
            }});

            assert.equal(processed, '<a>Upgrade</a>');
        });

        it('Skips non-URLs', () => {
            const htmlContent = `<body><table><tr id="content-blocks"><a href="{{not_a_url}}">Upgrade</a></tr></table></body>`;
            const processed = processHTML({html: htmlContent, postData: mappedObject, options: {
                url: 'https://www.example.com'
            }});

            assert.equal(processed, '<a href="{{not_a_url}}">Upgrade</a>');
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

        it('Does remove first image if it is a match 5', () => {
            const newHtml = removeDuplicateFeatureImage({
                html: '<div><figure><img src="https://media.beehiiv.com/cdn-cgi/image/fit=scale-down,format=auto,onerror=redirect,quality=80/uploads/asset/file/12345678-1234-5678-abcd-fc76ef777f64/photo.png?t=1234994175" /></figure></div><p>Hi</p>',
                featureSrc: 'https://beehiiv-images-production.s3.amazonaws.com/uploads/asset/file/12345678-1234-5678-abcd-fc76ef777f64/photo.png?t=1234994175'
            });

            assert.equal(newHtml, '<div><figure/></div><p>Hi</p>');
        });

        it('Changes image size & quality attributes', () => {
            const newHtml = removeDuplicateFeatureImage({
                html: '<div><figure><img src="https://media.beehiiv.com/cdn-cgi/image/fit=scale-down,format=auto,onerror=redirect,quality=80/uploads/asset/file/12345678/image.png" /></figure></div><p>Hi</p>',
                featureSrc: 'https://media.beehiiv.com/cdn-cgi/image/quality=100/uploads/asset/file/12345678/image.png'
            });

            assert.equal(newHtml, '<div><figure/></div><p>Hi</p>');
        });
    });
});
