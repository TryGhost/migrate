import {strict as assert} from 'assert';
import {ErrorGroup} from '../../lib/importers/ErrorGroup.js';
import {ImportWarning} from '../../lib/importers/ImportWarning.js';
import {ImportError} from '../../lib/importers/ImportError.js';

describe('ErrorGroup', () => {
    it('isFatal returns false for warnings and true when there are errors', async () => {
        const group = new ErrorGroup();
        group.add(new ImportWarning({message: 'This is a warning'}));
        assert.equal(group.isFatal, false);

        group.add(new ImportError({message: 'This is an error'}));
        assert.equal(group.isFatal, true);
    });

    it('throwIfNotEmpty only throws for fatal errors', async () => {
        const group = new ErrorGroup();
        group.add(new ImportWarning({message: 'This is a warning'}));
        assert.doesNotThrow(() => group.throwIfNotEmpty());

        group.add(new ImportError({message: 'This is an error'}));
        assert.equal(group.isFatal, true);
        assert.throws(() => group.throwIfNotEmpty());
    });

    it('length returns correctly', async () => {
        const group = new ErrorGroup();
        assert.equal(group.length, 0);

        group.add(new ImportWarning({message: 'This is a warning'}));
        assert.equal(group.length, 1);

        group.add(new ImportError({message: 'This is an error'}));
        assert.equal(group.length, 2);
    });

    it('isEmpty returns correctly', async () => {
        const group = new ErrorGroup();
        assert.equal(group.isEmpty, true);

        group.add(new ImportWarning({message: 'This is a warning'}));
        assert.equal(group.isEmpty, false);

        group.add(new ImportError({message: 'This is an error'}));
        assert.equal(group.isEmpty, false);
    });

    it('toString is handled', async () => {
        let group = new ErrorGroup();
        assert.equal(group.isEmpty, true);

        group.add(new ImportWarning({message: 'This is a warning'}));
        assert.equal(group.toString(), 'This is a warning');

        group.add(new ImportWarning({message: 'This is a warning'}));
        assert.match(group.toString(), /Multiple warnings: /);

        // More than 15 warnings:
        for (let i = 0; i < 20; i++) {
            group.add(new ImportWarning({message: 'This is a warning'}));
        }
        assert.match(group.toString(), /Multiple warnings: /);
        assert.match(group.toString(), /and 7 more/);

        group.add(new ImportError({message: 'This is an error'}));
        assert.match(group.toString(), /Multiple errors: /);
        assert.match(group.toString(), /and 8 more/);

        group = new ErrorGroup();

        // Two errors only (no more than 15)
        group.add(new ImportError({message: 'This is an error'}));
        group.add(new ImportError({message: 'This is an error'}));

        assert.match(group.toString(), /Multiple errors: /);
    });
});
