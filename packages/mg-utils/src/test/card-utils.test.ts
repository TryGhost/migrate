import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {getCard} from '../lib/card-utils.js';

describe('cardUtils', function () {
    it('returns cards by name from kg-default-cards', function () {
        const imageCard = getCard('image');

        assert.equal(imageCard.name, 'image');
        assert.equal(typeof imageCard.render, 'function');
    });
});
