import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {convert} from '../lib/convert.js';
import {convertPost} from '../lib/convert-post.js';

let fakeLogger = {
    warn: () => {},
    error: () => {},
    debug: () => {}
};

describe('Convert', function () {
    it('Can convert to a HTML card', function () {
        let post = {
            html: '<h2>Good stuff here</h2>'
        };
        const htmlCard = true;

        convertPost(post, htmlCard, fakeLogger);

        const mobiledoc = JSON.parse(post.mobiledoc);

        assert.equal(mobiledoc.html, undefined);

        for (const key of ['version', 'markups', 'atoms', 'cards', 'sections']) {
            assert.ok(key in mobiledoc);
        }
        assert.equal(mobiledoc.version, '0.3.1');
        assert.equal(mobiledoc.markups.length, 0);
        assert.equal(mobiledoc.atoms.length, 0);
        assert.deepEqual(mobiledoc.sections, [[10, 0]]);

        // We're checking an unassosiative array here:
        // [ 'html', { cardName: 'html', html: '<h2>Good stuff here</h2>' } ]
        const card = mobiledoc.cards[0];
        assert.equal(card[0], 'html');
        assert.equal(card[1].cardName, 'html');
        assert.equal(card[1].html, '<h2>Good stuff here</h2>');
    });

    it('Covert to Mobiledoc section', function () {
        let post = {
            html: '<h2>Good stuff here</h2>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        assert.equal(mobiledoc.html, undefined);

        for (const key of ['version', 'markups', 'atoms', 'cards', 'sections']) {
            assert.ok(key in mobiledoc);
        }
        assert.equal(mobiledoc.version, '0.3.1');
        assert.equal(mobiledoc.markups.length, 0);
        assert.equal(mobiledoc.atoms.length, 0);
        assert.equal(mobiledoc.cards.length, 0);
        assert.deepEqual(mobiledoc.sections, [[1, 'h2', [[0, [], 0, 'Good stuff here']]]]);
    });

    it('Can catch an error', function () {
        // `wrong_key` should be `html`, and will throw an error
        let post = {
            wrong_key: '<h2>Good stuff here</h2>'
        };
        const htmlCard = false;

        try {
            convertPost(post, htmlCard);
        } catch (error) {
            assert.equal(typeof error, 'object');
            assert.ok(error !== null);
            assert.equal(error.name, 'InternalServerError');
            assert.equal(error.message, 'Post has no html field to convert');
        }
    });

    it('Covert full content to Mobiledoc', function () {
        let post = {
            html: '\
                <h2>Good stuff here</h2>\
                <img src="https://example.com/image.jpg" alt="Hello" />\
                <p>Hello <i>world</i></p>\
                <hr>\
                <p>Link to <a href="https://example.com">Example</a></p>\
                <p>Hello <br>world</p>\
                '
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        assert.equal(mobiledoc.html, undefined);

        for (const key of ['version', 'markups', 'atoms', 'cards', 'sections']) {
            assert.ok(key in mobiledoc);
        }
        assert.equal(mobiledoc.version, '0.3.1');
        assert.deepEqual(mobiledoc.atoms, [['soft-return', '', {}]]);
        assert.deepEqual(mobiledoc.cards, [['image',{src: 'https://example.com/image.jpg', alt: 'Hello'}],['hr',{}]]);
        assert.deepEqual(mobiledoc.markups, [['i'],['a',['href','https://example.com']]]);
        assert.deepEqual(mobiledoc.sections, [[1,'h2',[[0,[],0,'Good stuff here']]],[10,0],[1,'p',[[0,[],0,'Hello '],[0,[0],1,'world']]],[10,1],[1,'p',[[0,[],0,'Link to '],[0,[1],1,'Example']]],[1,'p',[[0,[],0,'Hello '],[1,[],0,0],[0,[],0,'world']]]]);
    });

    it('Correctly transforms relative Portal links that start with #', function () {
        let post = {
            html: '\
                <div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div>\
                <p>Please <a href="#/portal/signup">Subscribe</a></p>\
                <div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div>\
                <p>Please <a href="#/portal/signup">Subscribe</a></p>\
                <div class="kg-card kg-button-card kg-align-center"><a href="/#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div>\
                <p>Please <a href="/#/portal/signup">Subscribe</a></p>\
                <div class="kg-card kg-button-card kg-align-center"><a href="https://example.com/#/portal/signup/free" class="kg-btn kg-btn-accent">Subscribe</a></div>\
                <p>Please <a href="https://example.com/#/portal/signup/free">Subscribe</a></p>\
                '
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        assert.equal(mobiledoc.html, undefined);

        for (const key of ['version', 'markups', 'atoms', 'cards', 'sections']) {
            assert.ok(key in mobiledoc);
        }
        assert.equal(mobiledoc.version, '0.3.1');
        assert.deepEqual(mobiledoc.atoms, []);
        assert.deepEqual(mobiledoc.cards, [['button',{alignment: 'center', buttonUrl: '#/portal/signup', buttonText: 'Subscribe'}],['button',{alignment: 'center', buttonUrl: '#/portal/signup',buttonText: 'Subscribe'}],['button',{alignment: 'center', buttonUrl: '/#/portal/signup', buttonText: 'Subscribe'}],['button',{alignment: 'center', buttonUrl: 'https://example.com/#/portal/signup/free', buttonText: 'Subscribe'}]]);
        assert.deepEqual(mobiledoc.markups, [['a',['href','#/portal/signup']],['a',['href','/#/portal/signup']],['a',['href','https://example.com/#/portal/signup/free']]]);
        assert.deepEqual(mobiledoc.sections, [[10,0],[1,'p',[[0,[],0,'Please '],[0,[0],1,'Subscribe']]],[10,1],[1,'p',[[0,[],0,'Please '],[0,[0],1,'Subscribe']]],[10,2],[1,'p',[[0,[],0,'Please '],[0,[1],1,'Subscribe']]],[10,3],[1,'p',[[0,[],0,'Please '],[0,[2],1,'Subscribe']]]]);
    });

    it('Correctly converts a linked image', function () {
        let post = {
            html: '<a href="https://example.com"><img src="https://example.com/images/photo.jpg" /></a>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        for (const key of ['version', 'markups', 'atoms', 'cards', 'sections']) {
            assert.ok(key in mobiledoc);
        }
        assert.equal(mobiledoc.version, '0.3.1');
        assert.deepEqual(mobiledoc.atoms, []);
        assert.deepEqual(mobiledoc.cards, [['image',{src: 'https://example.com/images/photo.jpg', href: 'https://example.com/'}]]);
        assert.deepEqual(mobiledoc.markups, []);
        assert.deepEqual(mobiledoc.sections, [[10,0]]);
    });

    it('Correctly converts a linked image with alt & title text', function () {
        let post = {
            html: '<a href="https://example.com"><img src="https://example.com/images/photo.jpg" alt="My alt text" title="My title" /></a>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        for (const key of ['version', 'markups', 'atoms', 'cards', 'sections']) {
            assert.ok(key in mobiledoc);
        }
        assert.equal(mobiledoc.version, '0.3.1');
        assert.deepEqual(mobiledoc.atoms, []);
        assert.deepEqual(mobiledoc.cards, [['image',{src: 'https://example.com/images/photo.jpg', alt: 'My alt text', href: 'https://example.com/', title: 'My title'}]]);
        assert.deepEqual(mobiledoc.markups, []);
        assert.deepEqual(mobiledoc.sections, [[10,0]]);
    });

    it('Correctly converts a WordPress flavoured image', function () {
        let post = {
            html: '<figure class="wp-block-image alignwide size-large"><img loading="lazy" width="1024" height="683" src="https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg" alt="" class="wp-image-9438"><figcaption>My awesome page</figcaption></figure>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        for (const key of ['version', 'markups', 'atoms', 'cards', 'sections']) {
            assert.ok(key in mobiledoc);
        }
        assert.equal(mobiledoc.version, '0.3.1');
        assert.deepEqual(mobiledoc.atoms, []);
        assert.deepEqual(mobiledoc.cards, [['image',{src: 'https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg', width: 1024, height: 683, caption: 'My awesome page'}]]);
        assert.deepEqual(mobiledoc.markups, []);
        assert.deepEqual(mobiledoc.sections, [[10,0]]);
    });

    it('Correctly converts a WordPress flavoured linked image', function () {
        let post = {
            html: '<figure class="wp-block-image alignwide size-large"><a href="https://example.com/2021/12/13/compare/"><img loading="lazy" width="1024" height="683" src="https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg" alt="" class="wp-image-9438"></a><figcaption>My awesome page</figcaption></figure>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        for (const key of ['version', 'markups', 'atoms', 'cards', 'sections']) {
            assert.ok(key in mobiledoc);
        }
        assert.equal(mobiledoc.version, '0.3.1');
        assert.deepEqual(mobiledoc.atoms, []);
        assert.deepEqual(mobiledoc.cards, [['image',{src: 'https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg', width: 1024, height: 683, href: 'https://example.com/2021/12/13/compare/', caption: 'My awesome page'}]]);
        assert.deepEqual(mobiledoc.markups, []);
        assert.deepEqual(mobiledoc.sections, [[10,0]]);
    });
});

describe('Convert tasks', function () {
    it('Can make tasks', function () {
        let ctx = {
            result: {
                data: {
                    posts: [
                        {
                            html: '<h2>First post</h2>'
                        },
                        {
                            html: '<h2>Second post</h2>'
                        }
                    ]
                }
            }
        };

        let tasks = convert(ctx);

        assert.equal(tasks.length, 2);
    });
});
