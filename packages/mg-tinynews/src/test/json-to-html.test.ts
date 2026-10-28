import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
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
    EntryGoogleDocsEmbed,
    EntrySpotifyEmbed
} from '../lib/json-to-html.js';
import {TextNode} from '../lib/text.js';
import type {TinyNewsBlock} from '../index.js';

describe('JSON to HTML', function () {
    it('Returns HTML if given HTML', function () {
        const formatted = jsonToHtml('<p>Hello world</p>');

        assert.equal(formatted, '<p>Hello world</p>');
    });

    describe('formatChildStyles', function () {
        it('Bold', function () {
            const childElement = {
                style: {
                    bold: true
                },
                content: 'This sentence is bold.'
            };

            const formatted = formatChildStyles(childElement);

            assert.equal(formatted, '<strong>This sentence is bold.</strong>');
        });

        it('Bold, italic and underlined', function () {
            const childElement = {
                style: {
                    bold: true,
                    italic: true,
                    underline: true
                },
                content: 'This sentence is bold, italic and underlined.'
            };

            const formatted = formatChildStyles(childElement);

            assert.equal(formatted, '<strong><em><u>This sentence is bold, italic and underlined.</u></em></strong>');
        });

        it('A bold, italic and underlined link', function () {
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

            assert.equal(
                formatted,
                '<a href="https://ghost.org"><strong><em><u>This link is bold, italic and underlined.</u></em></strong></a>'
            );
        });
    });

    describe('Title', function () {
        it('Basic heading', function () {
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
            assert.equal(formatted, '<h1>Lorem Ipsum </h1>');
        });
    });

    describe('Subtitle', function () {
        it('Basic heading', function () {
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
            assert.equal(formatted, '<h2>Lorem Ipsum </h2>');
        });
    });

    describe('EntryHeading', function () {
        it('Basic heading', function () {
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
            assert.equal(formatted, '<h2>Heading 2 </h2>');
        });
    });

    describe('EntryText', function () {
        it('Paragraph with basic text', function () {
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

            assert.equal(
                formatted,
                '<p>This is a sentence in bold. This is a sentence in italics. This sentence is underlined. This sentence is bold, italic and underlined. This is a multi word link. This is a plain sentence. </p>'
            );
        });

        it('Paragraph with styles & links', function () {
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
            assert.equal(
                formatted,
                '<p><strong>This is a sentence in bold. </strong> <em>This is a sentence in italics. </em>  <u>This sentence is underlined. </u> <strong><em> <u>This sentence is bold, italic and underlined. </u> </em> </strong>  <a href="https://example.com/">This is a multi word link.</a> This is a plain sentence. </p>'
            );
        });

        it('Handles spaces correctly for page content', function () {
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
            assert.equal(
                formatted,
                '<p>Donate <a href="https://example.com/donate">here</a>. Subscribe <a href="https://example.com/subscribe">here</a>. </p>'
            );
        });
    });

    describe('EntryList', function () {
        it('Unordered list', function () {
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
                                content:
                                    'Vivamus congue, odio in placerat consequat, ex lorem venenatis risus, ut pretium felis nunc sit amet erat.'
                            }
                        ],
                        nestingLevel: 0
                    }
                ],
                listType: 'BULLET'
            };

            const formatted = EntryList(block);
            assert.equal(
                formatted,
                '<ul><li>Pellentesque eu quam eget orci varius vitae dui.</li><li>Maecenas pretium convallis nunc non hendrerit.</li><li>Vivamus congue, odio in placerat consequat, ex lorem venenatis risus, ut pretium felis nunc sit amet erat.</li></ul>'
            );
        });

        it('Ordered list', function () {
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
                                content:
                                    'Vivamus congue, odio in placerat consequat, ex lorem venenatis risus, ut pretium felis nunc sit amet erat.'
                            }
                        ],
                        nestingLevel: 0
                    }
                ],
                listType: 'NUMBER'
            };

            const formatted = EntryList(block);
            assert.equal(
                formatted,
                '<ol><li>Pellentesque eu quam eget orci varius vitae dui.</li><li>Maecenas pretium convallis nunc non hendrerit.</li><li>Vivamus congue, odio in placerat consequat, ex lorem venenatis risus, ut pretium felis nunc sit amet erat.</li></ol>'
            );
        });
    });

    describe('EntryImage', function () {
        it('Basic image', function () {
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
            assert.equal(
                formatted,
                '<figure class="kg-card kg-image-card"><img src="https://example.com/image.1234.jpg" class="kg-image" alt loading="lazy"></figure>'
            );
        });

        it('Linked image with caption', function () {
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
            assert.equal(
                formatted,
                '<figure class="kg-card kg-image-card kg-card-hascaption"><a href="https://ghost.org"><img src="https://example.com/image.1234.jpg" class="kg-image" alt="Lorem ipsum" loading="lazy"></a><figcaption>Lorem ipsum</figcaption></figure>'
            );
        });
    });

    describe('EntryBlockquote', function () {
        it('Make HR', function () {
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
            assert.equal(formatted, '<blockquote><p>Lorem ipsum</p></blockquote>');
        });
    });

    describe('EntryHorizontalRule', function () {
        it('Make HR', function () {
            const block = {
                type: 'hr',
                children: []
            };

            const formatted = EntryHorizontalRule(block);
            assert.equal(formatted, '<hr>');
        });
    });
});

describe('Embeds', function () {
    it('Twitter', function () {
        const block = {
            html: null,
            link: 'https://twitter.com/Example/status/12345678240918675457?s=20&t=abcd12345jQ3oSayj4TNRQ',
            type: 'embed',
            children: []
        };

        const formatted = EntryTwitterEmbed(block);
        assert.equal(
            formatted,
            '<figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet"><a href="https://twitter.com/Example/status/12345678240918675457?s=20&t=abcd12345jQ3oSayj4TNRQ"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure>'
        );
    });

    it('TikTok', function () {
        const block = {
            html: null,
            link: 'https://www.tiktok.com/@example/video/1234567857666835739?is_from_webapp=1&sender_device=pc',
            type: 'embed',
            children: []
        };

        const formatted = EntryTikTokEmbed(block);
        assert.equal(
            formatted,
            '<figure class="kg-card kg-embed-card"><blockquote class="tiktok-embed" cite="https://www.tiktok.com/@example/video/1234567857666835739" data-video-id="1234567857666835739" style="max-width: 605px;min-width: 325px;"><section><a target="_blank" title="@example" href="https://www.tiktok.com/@example?refer=embed">@example</a></section></blockquote><script async src="https://www.tiktok.com/embed.js"></script></figure>'
        );
    });

    it('Facebook (link)', function () {
        const block = {
            html: null,
            link: 'https://www.facebook.com/example/posts/12345678abcdergh',
            type: 'embed',
            children: []
        };

        const formatted = EntryFacebookEmbed(block);
        assert.equal(
            formatted,
            '<p><a href="https://www.facebook.com/example/posts/12345678abcdergh">https://www.facebook.com/example/posts/12345678abcdergh</a></p>'
        );
    });

    it('Facebook (html)', function () {
        const block = {
            html: '<div class="fb-post" data-href="https://www.facebook.com/example/posts/12345678abcdergh" data-width="552"><blockquote cite="https://graph.facebook.com/123456782492602/posts/9876543278806123/" class="fb-xfbml-parse-ignore">Posted by <a href="https://www.facebook.com/example">Example</a> on&nbsp;<a href="https://graph.facebook.com/123456782492602/posts/9876543278806123/">Saturday, August 20, 2022</a></blockquote></div>',
            link: 'https://www.facebook.com/example/posts/12345678abcdergh',
            type: 'embed',
            children: []
        };

        const formatted = EntryFacebookEmbed(block);
        assert.equal(
            formatted,
            '<!--kg-card-begin: html--><div class="fb-post" data-href="https://www.facebook.com/example/posts/12345678abcdergh" data-width="552"><blockquote cite="https://graph.facebook.com/123456782492602/posts/9876543278806123/" class="fb-xfbml-parse-ignore">Posted by <a href="https://www.facebook.com/example">Example</a> on&nbsp;<a href="https://graph.facebook.com/123456782492602/posts/9876543278806123/">Saturday, August 20, 2022</a></blockquote></div><!--kg-card-end: html-->'
        );
    });

    it('Vimeo', function () {
        const block = {
            html: null,
            link: 'https://vimeo.com/723429393',
            type: 'embed',
            children: []
        };

        const formatted = EntryVimeoEmbed(block);
        assert.equal(
            formatted,
            '<iframe src="https://player.vimeo.com/video/723429393" width="160" height="90" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>'
        );
    });

    it('YouTube (youtube.com)', function () {
        const block = {
            html: null,
            link: 'https://www.youtube.com/watch?v=n_abcd12345',
            type: 'embed',
            children: []
        };

        const formatted = EntryYoutubeEmbed(block);
        assert.equal(
            formatted,
            '<iframe width="160" height="90" src="https://www.youtube.com/embed/n_abcd12345" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>'
        );
    });

    it('YouTube (youtu.be)', function () {
        const block = {
            html: null,
            link: 'https://youtu.be/n_abcd12345',
            type: 'embed',
            children: []
        };

        const formatted = EntryYoutubeEmbed(block);
        assert.equal(
            formatted,
            '<iframe width="160" height="90" src="https://www.youtube.com/embed/n_abcd12345" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>'
        );
    });

    it('Apple Podcast', function () {
        const block = {
            html: null,
            link: 'https://podcasts.apple.com/us/podcast/example/id12345678',
            type: 'embed',
            children: []
        };

        const formatted = EntryApplePodcastsEmbed(block);
        assert.equal(
            formatted,
            '<iframe allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" frameborder="0" height="450" style="width:100%;max-width:660px;overflow:hidden;border-radius:10px;" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" src="https://embed.podcasts.apple.com/us/podcast/example/id12345678"></iframe>'
        );
    });

    it('Instagram Post', function () {
        const block = {
            html: null,
            link: 'https://www.instagram.com/p/abcd1234567/',
            type: 'embed',
            children: []
        };

        const formatted = EntryInstagramPostEmbed(block);
        assert.equal(
            formatted,
            '<iframe src="https://www.instagram.com/p/abcd1234567/embed/captioned/" class="instagram-media" allowtransparency="true" allowfullscreen="true" frameborder="0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px; min-width: 326px; padding: 0px;"></iframe><script async="" src="//www.instagram.com/embed.js"></script>'
        );
    });

    it('Instagram Reel', function () {
        const block = {
            html: null,
            link: 'https://www.instagram.com/reel/CqvvNv1NAFw/',
            type: 'embed',
            children: []
        };

        const formatted = EntryInstagramReelEmbed(block);
        assert.equal(
            formatted,
            '<iframe class="instagram-media" src="https://www.instagram.com/reel/CqvvNv1NAFw/embed/captioned/" allowtransparency="true" allowfullscreen="true" frameborder="0" scrolling="no" style="background: white; max-width: 540px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px; min-width: 326px; padding: 0px; position: relative;"></iframe><script async="" src="//www.instagram.com/embed.js"></script>'
        );
    });

    it('Google Docs', function () {
        const block = {
            html: null,
            link: 'https://docs.google.com/forms/d/e/12345678abcdefghyQHFRldkioVOLrwqofXDjTJFMgH5nnZN93xt0oA/viewform?embedded=true',
            type: 'embed',
            children: []
        };

        const formatted = EntryGoogleDocsEmbed(block);
        assert.equal(
            formatted,
            '<iframe class="googledocs-embed" src="https://docs.google.com/forms/d/e/12345678abcdefghyQHFRldkioVOLrwqofXDjTJFMgH5nnZN93xt0oA/viewform?embedded=true" allowtransparency="true" allowfullscreen="true" frameborder="0" style="width: 100%; height: 500px;"></iframe>'
        );
    });
});

describe('Embeds without the parts they need', function () {
    it('Link TikTok and Vimeo embeds without a video', function () {
        assert.equal(
            EntryTikTokEmbed({link: 'https://www.tiktok.com/discover'}),
            '<p><a href="https://www.tiktok.com/discover">https://www.tiktok.com/discover</a></p>'
        );
        assert.equal(
            EntryVimeoEmbed({link: 'https://vimeo.com/channels'}),
            '<p><a href="https://vimeo.com/channels">https://vimeo.com/channels</a></p>'
        );
    });

    it('Embeds YouTube links without a video ID as they are', function () {
        assert.match(
            EntryYoutubeEmbed({link: 'https://www.youtube.com/live'}),
            /src="https:\/\/www\.youtube\.com\/embed\/https:\/\/www\.youtube\.com\/live"/
        );
    });

    it('Spotify episodes and shows', function () {
        assert.equal(
            EntrySpotifyEmbed({link: 'https://open.spotify.com/episode/abc'}),
            '<iframe src="https://open.spotify.com/embed/episode/abc" width="300" height="380" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>'
        );
        assert.match(
            EntrySpotifyEmbed({link: 'https://open.spotify.com/show/def'}),
            /src="https:\/\/open\.spotify\.com\/embed\/show\/def"/
        );
    });
});

describe('Blocks with missing parts', function () {
    it('Formats children without styles or content', function () {
        assert.equal(formatChildStyles({}), '');
        assert.equal(
            formatChildStyles({content: 'Plain', link: 'https://example.com'}),
            '<a href="https://example.com">Plain</a>'
        );
    });

    it('Converts lists, images and quotes without children to nothing', function () {
        assert.equal(EntryList({listType: 'NUMBER'}), '<ol></ol>');
        assert.equal(EntryList({items: [{}, {children: [{content: 'One'}]}]}), '<ul><li>One</li></ul>');
        assert.equal(EntryImage({}), '');
        assert.equal(EntryImage({children: []}), '');
        assert.equal(EntryBlockquote({}), '');
        assert.equal(EntryBlockquote({children: [{content: ' '}, {}]}), '');
        assert.equal(
            EntryBlockquote({children: [{content: ' '}, {content: 'Quote', style: {italic: true}}]}),
            '<blockquote><p><em>Quote</em></p></blockquote>'
        );
    });

    it('Converts text blocks by style', function () {
        const children = [{content: 'Text', style: {}}];
        assert.equal(TextNode({node: {style: 'HEADING_4', children}}), '<h4>Text </h4>');
        assert.equal(TextNode({node: {style: 'FORMATTED_TEXT', children}}), '<pre>Text </pre>');
        assert.equal(TextNode({node: {children}}), 'Text ');
        assert.equal(TextNode({node: {style: 'NORMAL_TEXT'}}), null);
        assert.equal(
            TextNode({node: {style: 'NORMAL_TEXT', children: [{content: 'FORMAT START'}, {content: ''}]}}),
            null
        );
    });

    it('Breaks lines for blank children and doubles spaces after children without styles', function () {
        assert.equal(
            TextNode({
                node: {
                    style: 'NORMAL_TEXT',
                    children: [
                        {content: ' ', style: {}},
                        {content: 'After', style: {}}
                    ]
                }
            }),
            '<p><br />After </p>'
        );
        assert.equal(
            TextNode({
                node: {
                    style: 'NORMAL_TEXT',
                    children: [
                        {content: ' ', style: {}},
                        {content: ' ', style: {}}
                    ]
                }
            }),
            '<p>    </p>'
        );
        assert.equal(TextNode({node: {style: 'NORMAL_TEXT', children: [{content: ' ', style: {}}]}}), '<p>  </p>');
        assert.equal(TextNode({node: {style: 'NORMAL_TEXT', children: [{content: 'Unstyled'}]}}), '<p>Unstyled  </p>');
        assert.equal(
            TextNode({node: {style: 'NORMAL_TEXT', children: [{content: 'Link', link: 'https://example.com'}]}}),
            '<p> <a href="https://example.com">Link</a> </p>'
        );
    });
});

describe('jsonToHtml', function () {
    it('Converts every supported block and embed, skipping main images', function () {
        const embed = (link: string): TinyNewsBlock => ({type: 'embed', link});
        const blocks: TinyNewsBlock[] = [
            {type: 'mainImage', children: [{imageUrl: 'https://example.com/main.jpg'}]},
            {type: 'text', style: 'TITLE', children: [{content: 'Title', style: {}}]},
            {type: 'text', style: 'NORMAL_TEXT', children: [{content: 'Text', style: {}}]},
            {type: 'blockquote', children: [{content: 'Quote', style: {}}]},
            {type: 'hr'},
            {type: 'list', items: [{children: [{content: 'Item', style: {}}]}]},
            {type: 'image', children: [{imageUrl: 'https://example.com/image.jpg', imageAlt: 'Alt'}]},
            embed('https://twitter.com/example/status/1'),
            embed('https://www.tiktok.com/@example/video/1234567890123'),
            embed('https://www.facebook.com/example/posts/1'),
            embed('https://vimeo.com/123456'),
            embed('https://www.youtube.com/watch?v=abc123'),
            embed('https://youtu.be/def456'),
            embed('https://podcasts.apple.com/us/podcast/example/id1'),
            embed('https://open.spotify.com/episode/abc'),
            embed('https://open.spotify.com/show/def'),
            embed('https://www.instagram.com/p/abc/'),
            embed('https://www.instagram.com/reel/def/'),
            embed('https://docs.google.com/forms/d/e/abc/viewform')
        ];
        const reasons: string[] = [];
        const html = jsonToHtml(blocks, {onUnhandled: reason => reasons.push(reason)});

        assert.deepEqual(reasons, []);
        assert.ok(!html.includes('main.jpg'));
        for (const expected of [
            '<h1>Title </h1><p>Text </p><blockquote><p>Quote</p></blockquote><hr><ul><li>Item</li></ul>',
            'src="https://example.com/image.jpg"',
            'class="twitter-tweet"',
            'class="tiktok-embed"',
            '<p><a href="https://www.facebook.com/example/posts/1">',
            'https://player.vimeo.com/video/123456',
            'https://www.youtube.com/embed/abc123',
            'https://www.youtube.com/embed/def456',
            'https://embed.podcasts.apple.com/us/podcast/example/id1',
            'https://open.spotify.com/embed/episode/abc',
            'https://open.spotify.com/embed/show/def',
            'src="https://www.instagram.com/p/abc/embed/captioned/" class="instagram-media"',
            'class="instagram-media" src="https://www.instagram.com/reel/def/embed/captioned/"',
            'class="googledocs-embed"'
        ]) {
            assert.ok(html.includes(expected), expected);
        }
    });

    it('Leaves out blocks it cannot convert, passing them to onUnhandled', function () {
        const blocks: TinyNewsBlock[] = [
            {type: 'text', style: 'FORMATTED_TEXT', children: [{content: 'Code'}]},
            {type: 'text', children: [{content: 'No style'}]},
            {type: 'embed', link: 'https://open.spotify.com/track/abc'},
            {type: 'embed', link: 'https://www.instagram.com/stories/abc/'},
            {type: 'embed', link: 'https://example.com/embed'},
            {type: 'embed', link: 'not a url'},
            {type: 'embed', link: null},
            {type: 'table'},
            {children: []},
            {type: 'text', style: 'NORMAL_TEXT', children: [{content: 'Kept', style: {}}]}
        ];
        const unhandled: [string, TinyNewsBlock][] = [];
        const html = jsonToHtml(blocks, {onUnhandled: (reason, block) => unhandled.push([reason, block])});

        assert.equal(html, '<p>Kept </p>');
        assert.deepEqual(
            unhandled.map(([reason]) => reason),
            [
                'Unhandled text style: FORMATTED_TEXT',
                'Unhandled text style: null',
                'Unhandled embed: https://open.spotify.com/track/abc',
                'Unhandled embed: https://www.instagram.com/stories/abc/',
                'Unhandled embed: https://example.com/embed',
                'Unhandled embed: not a url',
                'Unhandled embed: null',
                'Unhandled block type: table',
                'Unhandled block type: null'
            ]
        );
        assert.equal(unhandled[7][1], blocks[7]);
        assert.equal(jsonToHtml(blocks), '<p>Kept </p>');
        assert.equal(jsonToHtml(null), '');
    });
});
