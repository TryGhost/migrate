/* eslint no-undef: 0 */
const {convertPost} = require('../lib/convertPost');

describe('Convert', function () {
    test('Can convert to a HTML card', function () {
        let post = {
            html: '<h2>Good stuff here</h2>'
        };
        const htmlCard = true;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        expect(mobiledoc.html).not.toBeDefined();

        expect(mobiledoc).toContainAllKeys(['version', 'markups', 'atoms', 'cards', 'sections']);
        expect(mobiledoc.version).toEqual('0.3.1');
        expect(mobiledoc.markups).toBeArrayOfSize(0);
        expect(mobiledoc.atoms).toBeArrayOfSize(0);
        expect(mobiledoc.sections).toEqual([[10, 0]]);

        // We're checking an unassosiative array here:
        // [ 'html', { cardName: 'html', html: '<h2>Good stuff here</h2>' } ]
        const card = mobiledoc.cards[0];
        expect(card[0]).toEqual('html');
        expect(card[1].cardName).toEqual('html');
        expect(card[1].html).toEqual('<h2>Good stuff here</h2>');
    });

    test('Covert to Mobiledoc section', function () {
        let post = {
            html: '<h2>Good stuff here</h2>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        expect(mobiledoc.html).not.toBeDefined();

        expect(mobiledoc).toContainAllKeys(['version', 'markups', 'atoms', 'cards', 'sections']);
        expect(mobiledoc.version).toEqual('0.3.1');
        expect(mobiledoc.markups).toBeArrayOfSize(0);
        expect(mobiledoc.atoms).toBeArrayOfSize(0);
        expect(mobiledoc.cards).toBeArrayOfSize(0);
        expect(mobiledoc.sections).toEqual([[1, 'h2', [[0, [], 0, 'Good stuff here']]]]);
    });

    test('Can catch an error', function () {
        // `wrong_key` should be `html`, and will throw an error
        let post = {
            wrong_key: '<h2>Good stuff here</h2>'
        };
        const htmlCard = false;

        try {
            convertPost(post, htmlCard);
        } catch (error) {
            expect(error).toBeObject();
            expect(error.name).toEqual('InternalServerError');
            expect(error.message).toEqual('Post has no html field to convert');
        }
    });

    test('Covert full content to Mobiledoc', function () {
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

        expect(mobiledoc.html).not.toBeDefined();

        expect(mobiledoc).toContainAllKeys(['version', 'markups', 'atoms', 'cards', 'sections']);
        expect(mobiledoc.version).toEqual('0.3.1');
        expect(mobiledoc.atoms).toEqual([['soft-return', '', {}]]);
        expect(mobiledoc.cards).toEqual([['image',{src: 'https://example.com/image.jpg', alt: 'Hello'}],['hr',{}]]);
        expect(mobiledoc.markups).toEqual([['i'],['a',['href','https://example.com']]]);
        expect(mobiledoc.sections).toEqual([[1,'h2',[[0,[],0,'Good stuff here']]],[10,0],[1,'p',[[0,[],0,'Hello '],[0,[0],1,'world']]],[10,1],[1,'p',[[0,[],0,'Link to '],[0,[1],1,'Example']]],[1,'p',[[0,[],0,'Hello '],[1,[],0,0],[0,[],0,'world']]]]);
    });

    test('Correctly transforms relative Portal links that start with #', function () {
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

        expect(mobiledoc.html).not.toBeDefined();

        expect(mobiledoc).toContainAllKeys(['version', 'markups', 'atoms', 'cards', 'sections']);
        expect(mobiledoc.version).toEqual('0.3.1');
        expect(mobiledoc.atoms).toEqual([]);
        expect(mobiledoc.cards).toEqual([['button',{alignment: 'center', buttonUrl: '#/portal/signup', buttonText: 'Subscribe'}],['button',{alignment: 'center', buttonUrl: '#/portal/signup',buttonText: 'Subscribe'}],['button',{alignment: 'center', buttonUrl: '/#/portal/signup', buttonText: 'Subscribe'}],['button',{alignment: 'center', buttonUrl: 'https://example.com/#/portal/signup/free', buttonText: 'Subscribe'}]]);
        expect(mobiledoc.markups).toEqual([['a',['href','#/portal/signup']],['a',['href','/#/portal/signup']],['a',['href','https://example.com/#/portal/signup/free']]]);
        expect(mobiledoc.sections).toEqual([[10,0],[1,'p',[[0,[],0,'Please '],[0,[0],1,'Subscribe']]],[10,1],[1,'p',[[0,[],0,'Please '],[0,[0],1,'Subscribe']]],[10,2],[1,'p',[[0,[],0,'Please '],[0,[1],1,'Subscribe']]],[10,3],[1,'p',[[0,[],0,'Please '],[0,[2],1,'Subscribe']]]]);
    });

    test('Correctly converts a linked image', function () {
        let post = {
            html: '<a href="https://example.com"><img src="https://example.com/images/photo.jpg" /></a>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        expect(mobiledoc).toContainAllKeys(['version', 'markups', 'atoms', 'cards', 'sections']);
        expect(mobiledoc.version).toEqual('0.3.1');
        expect(mobiledoc.atoms).toEqual([]);
        expect(mobiledoc.cards).toEqual([['image',{src: 'https://example.com/images/photo.jpg', href: 'https://example.com/'}]]);
        expect(mobiledoc.markups).toEqual([]);
        expect(mobiledoc.sections).toEqual([[10,0]]);
    });

    test('Correctly converts a linked image with alt & title text', function () {
        let post = {
            html: '<a href="https://example.com"><img src="https://example.com/images/photo.jpg" alt="My alt text" title="My title" /></a>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        expect(mobiledoc).toContainAllKeys(['version', 'markups', 'atoms', 'cards', 'sections']);
        expect(mobiledoc.version).toEqual('0.3.1');
        expect(mobiledoc.atoms).toEqual([]);
        expect(mobiledoc.cards).toEqual([['image',{src: 'https://example.com/images/photo.jpg', alt: 'My alt text', href: 'https://example.com/', title: 'My title'}]]);
        expect(mobiledoc.markups).toEqual([]);
        expect(mobiledoc.sections).toEqual([[10,0]]);
    });

    test('Correctly converts a WordPress flavoured image', function () {
        let post = {
            html: '<figure class="wp-block-image alignwide size-large"><img loading="lazy" width="1024" height="683" src="https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg" alt="" class="wp-image-9438"><figcaption>My awesome page</figcaption></figure>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        expect(mobiledoc).toContainAllKeys(['version', 'markups', 'atoms', 'cards', 'sections']);
        expect(mobiledoc.version).toEqual('0.3.1');
        expect(mobiledoc.atoms).toEqual([]);
        expect(mobiledoc.cards).toEqual([['image',{src: 'https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg', width: 1024, height: 683, caption: 'My awesome page'}]]);
        expect(mobiledoc.markups).toEqual([]);
        expect(mobiledoc.sections).toEqual([[10,0]]);
    });

    test('Correctly converts a WordPress flavoured linked image', function () {
        let post = {
            html: '<figure class="wp-block-image alignwide size-large"><a href="https://example.com/2021/12/13/compare/"><img loading="lazy" width="1024" height="683" src="https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg" alt="" class="wp-image-9438"></a><figcaption>My awesome page</figcaption></figure>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        expect(mobiledoc).toContainAllKeys(['version', 'markups', 'atoms', 'cards', 'sections']);
        expect(mobiledoc.version).toEqual('0.3.1');
        expect(mobiledoc.atoms).toEqual([]);
        expect(mobiledoc.cards).toEqual([['image',{src: 'https://example.com/wp-content/uploads/2021/12/photo-1024x683.jpg', width: 1024, height: 683, href: 'https://example.com/2021/12/13/compare/', caption: 'My awesome page'}]]);
        expect(mobiledoc.markups).toEqual([]);
        expect(mobiledoc.sections).toEqual([[10,0]]);
    });
});
