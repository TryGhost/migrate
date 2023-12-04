import {inspect} from 'node:util';
import assert from 'assert/strict';
import {convertPost} from '../index.js';
import type {postOptions} from '../lib/convert-post.js';

let fakeLogger = {
    warn: () => {},
    error: () => {},
    debug: () => {}
};

// Extend the postOptions interface to allow for testing with a wrong key
interface postOptionsTest extends postOptions {
    wrong_key?: any // Used to test for catching errors
}

describe('Convert Tasks', function () {
    test('Can convert to a HTML card', function () {
        let post: postOptions = {
            title: 'title',
            slug: 'slug',
            html: '<h2>Good stuff here</h2>'
        };

        convertPost(post, true, fakeLogger);

        const lexical = JSON.parse(post.lexical ? post.lexical : '');

        assert.equal(post.html, undefined);

        assert.deepEqual(lexical, {
            root: {
                children: [
                    {
                        type: 'html',
                        version: 1,
                        html: '<h2>Good stuff here</h2>'
                    }
                ],
                direction: null,
                format: '',
                indent: 0,
                type: 'root',
                version: 1
            }
        });
    });

    test('Covert to Lexical section', function () {
        let post: postOptions = {
            title: 'title',
            slug: 'slug',
            html: '<h2>Good stuff here</h2>'
        };

        convertPost(post, false);

        const lexical = JSON.parse(post.lexical ? post.lexical : '');

        assert.deepEqual(lexical.root, {
            children: [
                {
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'Good stuff here',
                            type: 'extended-text',
                            version: 1
                        }
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    type: 'extended-heading',
                    version: 1,
                    tag: 'h2'
                }
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1
        });
    });

    test('Can catch an error', function () {
        // `convertPost` will not be expecting the `wrong_key` property, so it will throw an error
        let post: postOptionsTest = {
            title: 'Title',
            slug: 'slug',
            wrong_key: '<h2>Good stuff here</h2>'
        };

        try {
            convertPost(post, false);
        } catch (error: any) {
            assert.equal(error.name, 'InternalServerError');
            assert.equal(error.message, 'Post has no html field to convert');
        }
    });
});

describe('HTML handling', function () {
    test('Covert full content to Lexical', function () {
        let post: postOptions = {
            title: 'Title',
            slug: 'slug',
            html: '\
                <h2>Lorem</h2>\
                <img src="https://example.com/image.jpg" alt="Hello" />\
                <p>Ipsum <i>dolor</i></p>\
                <hr>\
                <p>Link to <a href="https://example.com">Example</a></p>\
                <p>Sit <br><b><i>amet</i></b></p>\
                '
        };

        convertPost(post, false);

        const lexical = JSON.parse(post.lexical ? post.lexical : '');

        assert.deepEqual(lexical.root, {
            children: [
                {
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'Lorem',
                            type: 'extended-text',
                            version: 1
                        }
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    type: 'extended-heading',
                    version: 1,
                    tag: 'h2'
                },
                {
                    type: 'image',
                    version: 1,
                    src: 'https://example.com/image.jpg',
                    width: null,
                    height: null,
                    title: '',
                    alt: 'Hello',
                    caption: '',
                    cardWidth: 'regular',
                    href: ''
                },
                {
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'Ipsum ',
                            type: 'extended-text',
                            version: 1
                        },
                        {
                            detail: 0,
                            format: 2,
                            mode: 'normal',
                            style: '',
                            text: 'dolor',
                            type: 'extended-text',
                            version: 1
                        }
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1
                },
                {
                    type: 'horizontalrule',
                    version: 1
                },
                {
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'Link to ',
                            type: 'extended-text',
                            version: 1
                        },
                        {
                            children: [
                                {
                                    detail: 0,
                                    format: 0,
                                    mode: 'normal',
                                    style: '',
                                    text: 'Example',
                                    type: 'extended-text',
                                    version: 1
                                }
                            ],
                            direction: null,
                            format: '',
                            indent: 0,
                            type: 'link',
                            version: 1,
                            rel: null,
                            target: null,
                            title: null,
                            url: 'https://example.com'
                        }
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1
                },
                {
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'Sit',
                            type: 'extended-text',
                            version: 1
                        },
                        {
                            type: 'linebreak',
                            version: 1
                        },
                        {
                            detail: 0,
                            format: 3,
                            mode: 'normal',
                            style: '',
                            text: 'amet',
                            type: 'extended-text',
                            version: 1
                        }
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1
                }
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1
        });
    });

    test('Correctly transforms relative Portal links that start with #', function () {
        let post: postOptions = {
            title: 'Title',
            slug: 'slug',
            html: '\
                <div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe 1</a></div>\
                <p>Please <a href="#/portal/signup">Subscribe 2</a></p>\
                <div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe 3</a></div>\
                <p>Please <a href="#/portal/signup">Subscribe 4</a></p>\
                <div class="kg-card kg-button-card kg-align-center"><a href="/#/portal/signup" class="kg-btn kg-btn-accent">Subscribe 5</a></div>\
                <p>Please <a href="/#/portal/signup">Subscribe 6</a></p>\
                <div class="kg-card kg-button-card kg-align-center"><a href="https://example.com/#/portal/signup/free" class="kg-btn kg-btn-accent">Subscribe 7</a></div>\
                <p>Please <a href="https://example.com/#/portal/signup/free">Subscribe 8</a></p>\
                '
        };

        convertPost(post, false);

        const lexical = JSON.parse(post.lexical ? post.lexical : '');

        assert.deepEqual(lexical.root.children[0].buttonUrl, '#/portal/signup');
        assert.deepEqual(lexical.root.children[1].children[1].url, '#/portal/signup');
        assert.deepEqual(lexical.root.children[2].buttonUrl, '#/portal/signup');
        assert.deepEqual(lexical.root.children[3].children[1].url, '#/portal/signup');
        assert.deepEqual(lexical.root.children[4].buttonUrl, '/#/portal/signup');
        assert.deepEqual(lexical.root.children[5].children[1].url, '/#/portal/signup');
        assert.deepEqual(lexical.root.children[6].buttonUrl, 'https://example.com/#/portal/signup/free');
        assert.deepEqual(lexical.root.children[7].children[1].url, 'https://example.com/#/portal/signup/free');
    });

    test('Correctly converts a linked image', function () {
        let post: postOptions = {
            title: 'Title',
            slug: 'slug',
            html: '<a href="https://example.com"><img src="https://example.com/images/photo.jpg" /> Hello</a>'
        };

        convertPost(post, false);

        const lexical = JSON.parse(post.lexical ? post.lexical : '');

        assert.equal(lexical.root.children[0].children[0].type, 'link');
        assert.equal(lexical.root.children[0].children[0].url, 'https://example.com');
        assert.equal(lexical.root.children[0].children[0].children[0].type, 'image');
        assert.equal(lexical.root.children[0].children[0].children[0].src, 'https://example.com/images/photo.jpg');
        assert.equal(lexical.root.children[0].children[0].children[1].type, 'extended-text');
        assert.equal(lexical.root.children[0].children[0].children[1].text, 'Hello');
    });

    test('Correctly converts a linked image with img alt', function () {
        let post: postOptions = {
            title: 'Title',
            slug: 'slug',
            html: '<a href="https://example.com"><img src="https://example.com/images/photo.jpg" alt="Image alt" /> Hello</a>'
        };

        convertPost(post, false);

        const lexical = JSON.parse(post.lexical ? post.lexical : '');

        assert.equal(lexical.root.children[0].children[0].type, 'link');
        assert.equal(lexical.root.children[0].children[0].url, 'https://example.com');
        assert.equal(lexical.root.children[0].children[0].children[0].type, 'image');
        assert.equal(lexical.root.children[0].children[0].children[0].src, 'https://example.com/images/photo.jpg');
        assert.equal(lexical.root.children[0].children[0].children[0].alt, 'Image alt');
        assert.equal(lexical.root.children[0].children[0].children[1].type, 'extended-text');
        assert.equal(lexical.root.children[0].children[0].children[1].text, 'Hello');
    });

    test('Correctly converts a WordPress flavoured image', function () {
        let post: postOptions = {
            title: 'Title',
            slug: 'slug',
            html: '<figure class="wp-block-image alignwide size-large"><img loading="lazy" width="1024" height="683" src="https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg" alt="" class="wp-image-9438"><figcaption>My awesome page</figcaption></figure>'
        };

        convertPost(post, false);

        const lexical = JSON.parse(post.lexical ? post.lexical : '');

        assert.equal(lexical.root.children[0].type, 'image');
        assert.equal(lexical.root.children[0].src, 'https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg');
        assert.equal(lexical.root.children[0].caption, 'My awesome page');
        assert.equal(lexical.root.children[0].width, 1024);
        assert.equal(lexical.root.children[0].height, 683);
    });

    test('Correctly converts a WordPress flavoured linked image', function () {
        let post: postOptions = {
            title: 'Title',
            slug: 'slug',
            html: '<figure class="wp-block-image alignwide size-large"><a href="https://example.com/2021/12/13/compare/"><img loading="lazy" width="1024" height="683" src="https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg" alt="" class="wp-image-9438"></a><figcaption>My awesome page</figcaption></figure>'
        };

        convertPost(post, false);

        const lexical = JSON.parse(post.lexical ? post.lexical : '');

        assert.equal(lexical.root.children[0].type, 'image');
        assert.equal(lexical.root.children[0].src, 'https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg');
        assert.equal(lexical.root.children[0].caption, 'My awesome page');
        assert.equal(lexical.root.children[0].width, 1024);
        assert.equal(lexical.root.children[0].height, 683);
        assert.equal(lexical.root.children[0].href, 'https://example.com/2021/12/13/compare/');
    });

    test('Converts a nested list', function () {
        let post: postOptions = {
            title: 'Title',
            slug: 'slug',
            html: '\
                <ul>\
                    <li>Lorem</li>\
                    <li>Ipsum\
                        <ol>\
                            <li>One</li>\
                            <li>Two</li>\
                        </ol>\
                    </li>\
                </ul>'
        };

        convertPost(post, false);

        const lexical = JSON.parse(post.lexical ? post.lexical : '');

        assert.equal(lexical.root.children[0].children[0].type, 'listitem');
        assert.equal(lexical.root.children[0].children[0].children[0].text, 'Lorem');

        assert.equal(lexical.root.children[0].children[1].type, 'listitem');
        assert.equal(lexical.root.children[0].children[1].children[0].text, 'Ipsum');

        assert.equal(lexical.root.children[0].children[2].children[0].children[0].type, 'listitem');
        assert.equal(lexical.root.children[0].children[2].children[0].children[0].children[0].text, 'One');

        assert.equal(lexical.root.children[0].children[2].children[0].children[1].type, 'listitem');
        assert.equal(lexical.root.children[0].children[2].children[0].children[1].children[0].text, 'Two');
    });

    test('Converts paywall card', function () {
        let post: postOptions = {
            title: 'Title',
            slug: 'slug',
            html: '<p>Public content</p><!--members-only--><p>Premium content</p>'
        };

        convertPost(post, false);

        const lexical = JSON.parse(post.lexical ? post.lexical : '');

        assert.equal(lexical.root.children[0].children[0].type, 'extended-text');
        assert.equal(lexical.root.children[0].children[0].text, 'Public content');

        assert.equal(lexical.root.children[1].type, 'paywall');

        assert.equal(lexical.root.children[2].children[0].type, 'extended-text');
        assert.equal(lexical.root.children[2].children[0].text, 'Premium content');
    });
});
