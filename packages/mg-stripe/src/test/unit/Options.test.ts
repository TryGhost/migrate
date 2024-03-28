import assert from 'assert';
import {Options} from '../../lib/Options.js';

describe('Options', () => {
    it('Can read from empty argv', async () => {
        new Options({});
    });

    it('Can set very verbose', async () => {
        const options = new Options({
            'very-verbose': true
        });
        assert(options.verboseLevel === 2);
    });

    it('Can set verbose', async () => {
        const options = new Options({
            verbose: true
        });
        assert(options.verboseLevel === 1);
    });

    it('Can init Options singleton', async () => {
        Options.init({});
        assert(Options.shared);
    });
});
