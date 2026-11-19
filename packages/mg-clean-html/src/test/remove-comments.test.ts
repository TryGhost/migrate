import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {domUtils} from '@tryghost/mg-utils';
import {removeNonKoenigComments} from '../index.js';

describe('removeNonKoenigComments', function () {
    it('Returns an empty string for missing or empty HTML', function () {
        assert.equal(removeNonKoenigComments(), '');
        assert.equal(removeNonKoenigComments(null), '');
        assert.equal(removeNonKoenigComments(''), '');
        assert.equal(removeNonKoenigComments(' \n\t '), '');
    });

    it('Returns HTML without comments unchanged', function () {
        assert.equal(removeNonKoenigComments('<p>Hello</p>'), '<p>Hello</p>');
    });

    it('Removes non-Koenig comments, including nested ones', function () {
        const html =
            '<!-- wp:paragraph --><p>Hello<!-- inline --></p><!-- /wp:paragraph --><div><!-- nested --><span>World</span></div>';
        assert.equal(removeNonKoenigComments(html), '<p>Hello</p><div><span>World</span></div>');
    });

    it('Keeps Koenig card comments', function () {
        const html =
            '<!-- wp:html --><!--kg-card-begin: html--><div>Card<!-- inside --></div><!--kg-card-end: html--><!-- /wp:html -->';
        assert.equal(
            removeNonKoenigComments(html),
            '<!--kg-card-begin: html--><div>Card</div><!--kg-card-end: html-->'
        );
    });

    it('Preserves the paywall when cleaning an existing fragment in place', function () {
        domUtils.processFragment('<!-- wp:more --><!--members-only--><!-- /wp:more -->', parsed => {
            assert.equal(removeNonKoenigComments(parsed), '<!--members-only-->');
            assert.equal(parsed.html(), '<!--members-only-->');
        });
    });

    it('Returns an empty string when only comments and whitespace remain', function () {
        assert.equal(removeNonKoenigComments('<!-- wp:paragraph -->\n\n<!-- /wp:paragraph -->'), '');
    });
});
