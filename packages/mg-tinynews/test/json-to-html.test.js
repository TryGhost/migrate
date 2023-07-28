import {
    jsonToHtml,
    formatChildStyles,
    EntryList,
    EntryText,
    EntryImage,
    EntryHeading,
    EntryBlockquote,
    EntryHorizontalRule,
    EntryTwitterEmbed,
    EntryTikTokEmbed,
    EntryFacebookEmbed,
    EntryVimeoEmbed,
    EntryYoutubeEmbed,
    EntryApplePodcastsEmbed,
    EntryInstagramPostEmbed,
    EntryInstagramReelEmbed,
    EntryGoogleDocsEmbed
} from '../lib/json-to-html.js';

describe('JSON to HTML', function () {
    test('Returns HTML if given HTML', function () {
        const formatted = jsonToHtml('<p>Hello world</p>');

        expect(formatted).toEqual('<p>Hello world</p>');
    });

    describe('formatChildStyles', function () {
        test('Bold', function () {
            const childElement = {
                style: {
                    bold: true
                },
                content: 'This sentence is bold.'
            };

            const formatted = formatChildStyles(childElement);

            expect(formatted).toEqual('<strong>This sentence is bold.</strong>');
        });

        test('Bold, italic and underlined', function () {
            const childElement = {
                style: {
                    bold: true,
                    italic: true,
                    underline: true
                },
                content: 'This sentence is bold, italic and underlined.'
            };

            const formatted = formatChildStyles(childElement);

            expect(formatted).toEqual('<strong><em><u>This sentence is bold, italic and underlined.</u></em></strong>');
        });

        test('A bold, italic and underlined link', function () {
            const childElement = {
                link: 'https://ghost.org',
                style: {
                    bold: true,
                    italic: true,
                    underline: true
                },
                content: 'This link is bold, italic and underlined.'
            };

            const formatted = formatChildStyles(childElement);

            expect(formatted).toEqual('<a href="https://ghost.org"><strong><em><u>This link is bold, italic and underlined.</u></em></strong></a>');
        });
    });

    describe('Title', function () {
        test('Basic heading', function () {
            const block = {
                html: null,
                link: null,
                type: 'text',
                style: 'TITLE',
                children: [
                    {
                        index: 14,
                        style: {},
                        content: 'Lorem Ipsum'
                    }
                ]
            };

            const formatted = EntryHeading(block);
            expect(formatted).toEqual('<h1>Lorem Ipsum </h1>');
        });
    });

    describe('Subtitle', function () {
        test('Basic heading', function () {
            const block = {
                html: null,
                link: null,
                type: 'text',
                style: 'SUBTITLE',
                children: [
                    {
                        index: 14,
                        style: {},
                        content: 'Lorem Ipsum'
                    }
                ]
            };

            const formatted = EntryHeading(block);
            expect(formatted).toEqual('<h2>Lorem Ipsum </h2>');
        });
    });

    describe('EntryHeading', function () {
        test('Basic heading', function () {
            const block = {
                html: null,
                link: null,
                type: 'text',
                style: 'HEADING_2',
                children: [
                    {
                        style: {},
                        content: 'Heading 2'
                    }
                ]
            };

            const formatted = EntryHeading(block);
            expect(formatted).toEqual('<h2>Heading 2 </h2>');
        });
    });

    describe('EntryText', function () {
        test('Paragraph with basic text', function () {
            const block = {
                html: null,
                link: null,
                type: 'text',
                style: 'NORMAL_TEXT',
                children: [
                    {
                        style: {},
                        content: 'This is a sentence in bold.'
                    },
                    {
                        style: {},
                        content: ''
                    },
                    {
                        style: {},
                        content: 'This is a sentence in italics.'
                    },
                    {
                        style: {},
                        content: ''
                    },
                    {
                        style: {},
                        content: 'This sentence is underlined.'
                    },
                    {
                        style: {},
                        content: ''
                    },
                    {
                        style: {},
                        content: 'This sentence is bold, italic and underlined.'
                    },
                    {
                        style: {},
                        content: ''
                    },
                    {
                        style: {},
                        content: 'This is a multi word link.'
                    },
                    {
                        style: {},
                        content: 'This is a plain sentence.'
                    }
                ]
            };

            const formatted = EntryText(block);

            expect(formatted).toEqual('<p>This is a sentence in bold. This is a sentence in italics. This sentence is underlined. This sentence is bold, italic and underlined. This is a multi word link. This is a plain sentence. </p>');
        });

        test('Paragraph with styles & links', function () {
            const block = {
                html: null,
                link: null,
                type: 'text',
                style: 'NORMAL_TEXT',
                children: [
                    {
                        style: {
                            bold: true
                        },
                        content: 'This is a sentence in bold.'
                    },
                    {
                        style: {},
                        content: ''
                    },
                    {
                        style: {
                            italic: true
                        },
                        content: 'This is a sentence in italics.'
                    },
                    {
                        style: {},
                        content: ''
                    },
                    {
                        style: {
                            underline: true
                        },
                        content: 'This sentence is underlined.'
                    },
                    {
                        style: {},
                        content: ''
                    },
                    {
                        style: {
                            bold: true,
                            italic: true,
                            underline: true
                        },
                        content: 'This sentence is bold, italic and underlined.'
                    },
                    {
                        style: {},
                        content: ''
                    },
                    {
                        link: 'https://example.com/',
                        style: {
                            underline: true
                        },
                        content: 'This is a multi word link.'
                    },
                    {
                        style: {},
                        content: 'This is a plain sentence.'
                    }
                ]
            };

            const formatted = EntryText(block);
            expect(formatted).toEqual('<p><strong>This is a sentence in bold. </strong> <em>This is a sentence in italics. </em>  <u>This sentence is underlined. </u> <strong><em> <u>This sentence is bold, italic and underlined. </u> </em> </strong>  <a href="https://example.com/">This is a multi word link.</a> This is a plain sentence. </p>');
        });

        test('Handles spaces correctly for page content', function () {
            const block = {
                html: null,
                link: null,
                type: 'text',
                style: 'NORMAL_TEXT',
                children: [
                    {
                        index: 435,
                        style: {},
                        content: 'Donate'
                    },
                    {
                        link: 'https://example.com/donate',
                        index: 439,
                        style: {
                            underline: true
                        },
                        content: 'here'
                    },
                    {
                        index: 451,
                        style: {},
                        content: '. Subscribe'
                    },
                    {
                        link: 'https://example.com/subscribe',
                        index: 455,
                        style: {
                            underline: true
                        },
                        content: 'here'
                    },
                    {
                        index: 458,
                        style: {},
                        content: '.'
                    }
                ]
            };

            const formatted = EntryText(block);
            expect(formatted).toEqual('<p>Donate <a href="https://example.com/donate">here</a>. Subscribe <a href="https://example.com/subscribe">here</a>. </p>');
        });
    });

    describe('EntryList', function () {
        test('Unordered list', function () {
            const block = {
                html: null,
                link: null,
                type: 'list',
                items: [
                    {
                        children: [
                            {
                                style: {},
                                content: 'Pellentesque eu quam eget orci varius vitae dui.'
                            }
                        ],
                        nestingLevel: 0
                    },
                    {
                        children: [
                            {
                                style: {},
                                content: 'Maecenas pretium convallis nunc non hendrerit.'
                            }
                        ],
                        nestingLevel: 0
                    },
                    {
                        children: [
                            {
                                style: {},
                                content: 'Vivamus congue, odio in placerat consequat, ex lorem venenatis risus, ut pretium felis nunc sit amet erat.'
                            }
                        ],
                        nestingLevel: 0
                    }
                ],
                listType: 'BULLET'
            };

            const formatted = EntryList(block);
            expect(formatted).toEqual('<ul><li>Pellentesque eu quam eget orci varius vitae dui.</li><li>Maecenas pretium convallis nunc non hendrerit.</li><li>Vivamus congue, odio in placerat consequat, ex lorem venenatis risus, ut pretium felis nunc sit amet erat.</li></ul>');
        });

        test('Ordered list', function () {
            const block = {
                html: null,
                link: null,
                type: 'list',
                items: [
                    {
                        children: [
                            {
                                style: {},
                                content: 'Pellentesque eu quam eget orci varius vitae dui.'
                            }
                        ],
                        nestingLevel: 0
                    },
                    {
                        children: [
                            {
                                style: {},
                                content: 'Maecenas pretium convallis nunc non hendrerit.'
                            }
                        ],
                        nestingLevel: 0
                    },
                    {
                        children: [
                            {
                                style: {},
                                content: 'Vivamus congue, odio in placerat consequat, ex lorem venenatis risus, ut pretium felis nunc sit amet erat.'
                            }
                        ],
                        nestingLevel: 0
                    }
                ],
                listType: 'NUMBER'
            };

            const formatted = EntryList(block);
            expect(formatted).toEqual('<ol><li>Pellentesque eu quam eget orci varius vitae dui.</li><li>Maecenas pretium convallis nunc non hendrerit.</li><li>Vivamus congue, odio in placerat consequat, ex lorem venenatis risus, ut pretium felis nunc sit amet erat.</li></ol>');
        });
    });

    describe('EntryImage', function () {
        test('Basic image', function () {
            const block = {
                link: null,
                type: 'image',
                children: [
                    {
                        index: 1123,
                        width: 746,
                        height: 850,
                        imageId: '1234',
                        imageAlt: null,
                        imageUrl: 'https://example.com/image.1234.jpg'
                    }
                ]
            };

            const formatted = EntryImage(block);
            expect(formatted).toEqual('<figure class="kg-card kg-image-card"><img src="https://example.com/image.1234.jpg" class="kg-image" alt loading="lazy"></figure>');
        });

        test('Linked image with caption', function () {
            const block = {
                link: 'https://ghost.org',
                type: 'image',
                children: [
                    {
                        index: 1123,
                        width: 746,
                        height: 850,
                        imageId: '1234',
                        imageAlt: 'Lorem ipsum',
                        imageUrl: 'https://example.com/image.1234.jpg'
                    }
                ]
            };

            const formatted = EntryImage(block);
            expect(formatted).toEqual('<figure class="kg-card kg-image-card kg-card-hascaption"><a href="https://ghost.org"><img src="https://example.com/image.1234.jpg" class="kg-image" alt="Lorem ipsum" loading="lazy"></a><figcaption>Lorem ipsum</figcaption></figure>');
        });
    });

    describe('EntryBlockquote', function () {
        test('Make HR', function () {
            const block = {
                html: null,
                link: null,
                type: 'blockquote',
                style: 'NORMAL_TEXT',
                children: [
                    {
                        style: {},
                        content: 'Lorem ipsum'
                    }
                ]
            };

            const formatted = EntryBlockquote(block);
            expect(formatted).toEqual('<blockquote><p>Lorem ipsum</p></blockquote>');
        });
    });

    describe('EntryHorizontalRule', function () {
        test('Make HR', function () {
            const block = {
                type: 'hr',
                children: []
            };

            const formatted = EntryHorizontalRule(block);
            expect(formatted).toEqual('<hr>');
        });
    });
});

describe('Embeds', function () {
    test('Twitter', function () {
        const block = {
            html: null,
            link: 'https://twitter.com/Example/status/12345678240918675457?s=20&t=abcd12345jQ3oSayj4TNRQ',
            type: 'embed',
            children: []
        };

        const formatted = EntryTwitterEmbed(block);
        expect(formatted).toEqual('<figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet"><a href="https://twitter.com/Example/status/12345678240918675457?s=20&t=abcd12345jQ3oSayj4TNRQ"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure>');
    });

    test('TikTok', function () {
        const block = {
            html: null,
            link: 'https://www.tiktok.com/@example/video/1234567857666835739?is_from_webapp=1&sender_device=pc',
            type: 'embed',
            children: []
        };

        const formatted = EntryTikTokEmbed(block);
        expect(formatted).toEqual('<figure class="kg-card kg-embed-card"><blockquote class="tiktok-embed" cite="https://www.tiktok.com/@example/video/1234567857666835739" data-video-id="1234567857666835739" style="max-width: 605px;min-width: 325px;"><section><a target="_blank" title="@example" href="https://www.tiktok.com/@example?refer=embed">@example</a></section></blockquote><script async src="https://www.tiktok.com/embed.js"></script></figure>');
    });

    test('Facebook (link)', function () {
        const block = {
            html: null,
            link: 'https://www.facebook.com/example/posts/12345678abcdergh',
            type: 'embed',
            children: []
        };

        const formatted = EntryFacebookEmbed(block);
        expect(formatted).toEqual('<p><a href="https://www.facebook.com/example/posts/12345678abcdergh">https://www.facebook.com/example/posts/12345678abcdergh</a></p>');
    });

    test('Facebook (html)', function () {
        const block = {
            html: '<div class="fb-post" data-href="https://www.facebook.com/example/posts/12345678abcdergh" data-width="552"><blockquote cite="https://graph.facebook.com/123456782492602/posts/9876543278806123/" class="fb-xfbml-parse-ignore">Posted by <a href="https://www.facebook.com/example">Example</a> on&nbsp;<a href="https://graph.facebook.com/123456782492602/posts/9876543278806123/">Saturday, August 20, 2022</a></blockquote></div>',
            link: 'https://www.facebook.com/example/posts/12345678abcdergh',
            type: 'embed',
            children: []
        };

        const formatted = EntryFacebookEmbed(block);
        expect(formatted).toEqual('<!--kg-card-begin: html--><div class="fb-post" data-href="https://www.facebook.com/example/posts/12345678abcdergh" data-width="552"><blockquote cite="https://graph.facebook.com/123456782492602/posts/9876543278806123/" class="fb-xfbml-parse-ignore">Posted by <a href="https://www.facebook.com/example">Example</a> on&nbsp;<a href="https://graph.facebook.com/123456782492602/posts/9876543278806123/">Saturday, August 20, 2022</a></blockquote></div><!--kg-card-end: html-->');
    });

    test('Vimeo', function () {
        const block = {
            html: null,
            link: 'https://vimeo.com/723429393',
            type: 'embed',
            children: []
        };

        const formatted = EntryVimeoEmbed(block);
        expect(formatted).toEqual('<iframe src="https://player.vimeo.com/video/723429393" width="160" height="90" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>');
    });

    test('YouTube (youtube.com)', function () {
        const block = {
            html: null,
            link: 'https://www.youtube.com/watch?v=n_abcd12345',
            type: 'embed',
            children: []
        };

        const formatted = EntryYoutubeEmbed(block);
        expect(formatted).toEqual('<iframe width="160" height="90" src="https://www.youtube.com/embed/n_abcd12345" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>');
    });

    test('YouTube (youtu.be)', function () {
        const block = {
            html: null,
            link: 'https://youtu.be/n_abcd12345',
            type: 'embed',
            children: []
        };

        const formatted = EntryYoutubeEmbed(block);
        expect(formatted).toEqual('<iframe width="160" height="90" src="https://www.youtube.com/embed/n_abcd12345" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>');
    });

    test('Apple Podcast', function () {
        const block = {
            html: null,
            link: 'https://podcasts.apple.com/us/podcast/example/id12345678',
            type: 'embed',
            children: []
        };

        const formatted = EntryApplePodcastsEmbed(block);
        expect(formatted).toEqual('<iframe allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" frameborder="0" height="450" style="width:100%;max-width:660px;overflow:hidden;border-radius:10px;" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" src="https://embed.podcasts.apple.com/us/podcast/example/id12345678"></iframe>');
    });

    test('Instagram Post', function () {
        const block = {
            html: null,
            link: 'https://www.instagram.com/p/abcd1234567/',
            type: 'embed',
            children: []
        };

        const formatted = EntryInstagramPostEmbed(block);
        expect(formatted).toEqual('<iframe src="https://www.instagram.com/p/abcd1234567/embed/captioned/" class="instagram-media" allowtransparency="true" allowfullscreen="true" frameborder="0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px; min-width: 326px; padding: 0px;"></iframe><script async="" src="//www.instagram.com/embed.js"></script>');
    });

    test('Instagram Reel', function () {
        const block = {
            html: null,
            link: 'https://www.instagram.com/reel/CqvvNv1NAFw/',
            type: 'embed',
            children: []
        };

        const formatted = EntryInstagramReelEmbed(block);
        expect(formatted).toEqual('<iframe class="instagram-media" src="https://www.instagram.com/reel/CqvvNv1NAFw/embed/captioned/" allowtransparency="true" allowfullscreen="true" frameborder="0" scrolling="no" style="background: white; max-width: 540px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px; min-width: 326px; padding: 0px; position: relative;"></iframe><script async="" src="//www.instagram.com/embed.js"></script>');
    });

    test('Google Docs', function () {
        const block = {
            html: null,
            link: 'https://docs.google.com/forms/d/e/12345678abcdefghyQHFRldkioVOLrwqofXDjTJFMgH5nnZN93xt0oA/viewform?embedded=true',
            type: 'embed',
            children: []
        };

        const formatted = EntryGoogleDocsEmbed(block);
        expect(formatted).toEqual('<iframe class="googledocs-embed" src="https://docs.google.com/forms/d/e/12345678abcdefghyQHFRldkioVOLrwqofXDjTJFMgH5nnZN93xt0oA/viewform?embedded=true" allowtransparency="true" allowfullscreen="true" frameborder="0" style="width: 100%; height: 500px;"></iframe>');
    });
});
