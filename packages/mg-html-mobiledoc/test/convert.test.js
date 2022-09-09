// Switch these lines once there are useful utils
require('./utils');

const {convertPost} = require('../lib/convertPost');

describe('Convert', function () {
    it('can convert to a HTML card', function () {
        let post = {
            html: '<h2>Good stuff here</h2>'
        };
        const htmlCard = true;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        should.not.exist(mobiledoc.html);

        mobiledoc.should.be.an.Object().with.properties('version', 'markups', 'atoms', 'cards', 'sections');
        mobiledoc.version.should.eql('0.3.1');
        mobiledoc.markups.should.be.empty();
        mobiledoc.atoms.should.be.empty();
        mobiledoc.sections.should.eql([[10, 0]]);

        // We're checking an unassosiative array here:
        // [ 'html', { cardName: 'html', html: '<h2>Good stuff here</h2>' } ]
        const card = mobiledoc.cards[0];
        card[0].should.eql('html');
        card[1].cardName.should.eql('html');
        card[1].html.should.eql('<h2>Good stuff here</h2>');
    });

    it('covert to Mobiledoc section', function () {
        let post = {
            html: '<h2>Good stuff here</h2>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        should.not.exist(mobiledoc.html);

        mobiledoc.should.be.an.Object().with.properties('version', 'markups', 'atoms', 'cards', 'sections');
        mobiledoc.version.should.eql('0.3.1');
        mobiledoc.markups.should.be.empty();
        mobiledoc.atoms.should.be.empty();
        mobiledoc.cards.should.be.empty();
        mobiledoc.sections.should.eql([[1, 'h2', [[0, [], 0, 'Good stuff here']]]]);
    });

    it('can catch an error', function () {
        // `wrong_key` should be `html`, and will throw an error
        let post = {
            wrong_key: '<h2>Good stuff here</h2>'
        };
        const htmlCard = false;

        try {
            convertPost(post, htmlCard);
        } catch (error) {
            error.should.be.an.Object();
            error.name.should.eql('InternalServerError');
            error.message.should.eql('Post has no html field to convert');
        }
    });

    it('covert full content to Mobiledoc', function () {
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

        should.not.exist(mobiledoc.html);

        mobiledoc.should.be.an.Object().with.properties('version', 'markups', 'atoms', 'cards', 'sections');
        mobiledoc.version.should.eql('0.3.1');
        mobiledoc.atoms.should.eql([['soft-return', '', {}]]);
        mobiledoc.cards.should.eql([['image',{src: 'https://example.com/image.jpg', alt: 'Hello'}],['hr',{}]]);
        mobiledoc.markups.should.eql([['i'],['a',['href','https://example.com']]]);
        mobiledoc.sections.should.eql([[1,'h2',[[0,[],0,'Good stuff here']]],[10,0],[1,'p',[[0,[],0,'Hello '],[0,[0],1,'world']]],[10,1],[1,'p',[[0,[],0,'Link to '],[0,[1],1,'Example']]],[1,'p',[[0,[],0,'Hello '],[1,[],0,0],[0,[],0,'world']]]]);
    });

    it('correctly transforms relative Portal links that start with #', function () {
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

        should.not.exist(mobiledoc.html);

        mobiledoc.should.be.an.Object().with.properties('version', 'markups', 'atoms', 'cards', 'sections');
        mobiledoc.version.should.eql('0.3.1');
        mobiledoc.atoms.should.eql([]);
        mobiledoc.cards.should.eql([['button',{alignment: 'center', buttonUrl: '#/portal/signup', buttonText: 'Subscribe'}],['button',{alignment: 'center', buttonUrl: '#/portal/signup',buttonText: 'Subscribe'}],['button',{alignment: 'center', buttonUrl: '/#/portal/signup', buttonText: 'Subscribe'}],['button',{alignment: 'center', buttonUrl: 'https://example.com/#/portal/signup/free', buttonText: 'Subscribe'}]]);
        mobiledoc.markups.should.eql([['a',['href','#/portal/signup']],['a',['href','/#/portal/signup']],['a',['href','https://example.com/#/portal/signup/free']]]);
        mobiledoc.sections.should.eql([[10,0],[1,'p',[[0,[],0,'Please '],[0,[0],1,'Subscribe']]],[10,1],[1,'p',[[0,[],0,'Please '],[0,[0],1,'Subscribe']]],[10,2],[1,'p',[[0,[],0,'Please '],[0,[1],1,'Subscribe']]],[10,3],[1,'p',[[0,[],0,'Please '],[0,[2],1,'Subscribe']]]]);
    });

    it('Correctly converts a linked image', function () {
        let post = {
            html: '<a href="https://example.com"><img src="https://example.com/images/photo.jpg" /></a>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        mobiledoc.should.be.an.Object().with.properties('version', 'markups', 'atoms', 'cards', 'sections');
        mobiledoc.version.should.eql('0.3.1');
        mobiledoc.atoms.should.eql([]);
        mobiledoc.cards.should.eql([['image',{src: 'https://example.com/images/photo.jpg', href: 'https://example.com/'}]]);
        mobiledoc.markups.should.eql([]);
        mobiledoc.sections.should.eql([[10,0]]);
    });

    it('Correctly converts a linked image with alt & title text', function () {
        let post = {
            html: '<a href="https://example.com"><img src="https://example.com/images/photo.jpg" alt="My alt text" title="My title" /></a>'
        };
        const htmlCard = false;

        convertPost(post, htmlCard);

        const mobiledoc = JSON.parse(post.mobiledoc);

        mobiledoc.should.be.an.Object().with.properties('version', 'markups', 'atoms', 'cards', 'sections');
        mobiledoc.version.should.eql('0.3.1');
        mobiledoc.atoms.should.eql([]);
        mobiledoc.cards.should.eql([['image',{src: 'https://example.com/images/photo.jpg', alt: 'My alt text', href: 'https://example.com/', title: 'My title'}]]);
        mobiledoc.markups.should.eql([]);
        mobiledoc.sections.should.eql([[10,0]]);
    });
});
