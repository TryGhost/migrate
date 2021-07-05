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
});
