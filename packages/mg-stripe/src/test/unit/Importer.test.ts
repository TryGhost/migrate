import assert from 'node:assert/strict';
import {describe, it, before} from 'node:test';
import Importer from '../../lib/importers/Importer.js';
import {ReportTags, Reporter, ReportingCategory} from '../../lib/importers/Reporter.js';
import {ImportWarning} from '../../lib/importers/ImportWarning.js';
import {Logger} from '../../lib/Logger.js';
import {ImportError} from '../../lib/importers/ImportError.js';

class TestObject {
    id: string;
    name: string;

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
    }
}

async function* createAsyncIterator(list: TestObject[]): {[Symbol.asyncIterator](): AsyncIterator<TestObject>} {
    for (const item of list) {
        yield item;
    }
}

const baseProvider = {
    getByID(oldId: string) {
        return Promise.resolve(new TestObject(oldId, 'name'));
    },

    getAll() {
        return createAsyncIterator([
            new TestObject('1', 'name1'),
            new TestObject('2', 'name2')
        ]);
    },

    /**
     * Find the newID for a given oldID, in case the oldID was already imported previously in another run.
     */
    findExisting(oldItem: TestObject) {
        return Promise.resolve(undefined);
    },

    /**
     * Recreate an existing item in the new account.
     */
    recreate(oldItem: TestObject, tags: ReportTags) {
        return Promise.resolve('newid' + oldItem.id);
    },

    /**
     * Recreate an existing item in the new account.
     */
    revert(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
        return Promise.resolve();
    },

    /**
     * Recreate an existing item in the new account.
     */
    confirm(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
        return Promise.resolve();
    }
};

const baseProviderWithExisting = {
    ...baseProvider,

    /**
     * Find the newID for a given oldID, in case the oldID was already imported previously in another run.
     */
    findExisting(oldItem: TestObject) {
        return Promise.resolve(
            new TestObject('newid' + oldItem.id, oldItem.name)
        );
    }
};

describe('Importer', () => {
    before(() => {
        Logger.init({verboseLevel: 2, debug: true});
    });

    describe('Recreate', () => {
        it('recreateByID', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProvider,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    recreate(oldItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        return Promise.resolve('newid');
                    }
                }
            });

            assert.equal(await importer.recreateByID('1'), 'newid');
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 1);

            // Doing it again is a noop
            assert.equal(await importer.recreateByID('1'), 'newid');
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 1);
        });

        it('recreateByObjectOrId - id', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProvider,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    recreate(oldItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        return Promise.resolve('newid');
                    }
                }
            });

            assert.equal(await importer.recreateByObjectOrId('1'), 'newid');
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 1);
        });

        it('recreateByObjectOrId - object', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProvider,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    recreate(oldItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        return Promise.resolve('newid');
                    }
                }
            });

            assert.equal(await importer.recreateByObjectOrId(new TestObject('1', 'test')), 'newid');
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 1);

            // Noop
            assert.equal(await importer.recreateByObjectOrId(new TestObject('1', 'test')), 'newid');
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 1);
        });

        it('recreateAndConfirm', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProvider,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    recreate(oldItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        return Promise.resolve('newid');
                    }
                }
            });

            assert.equal(await importer.recreateAndConfirm(new TestObject('1', 'test')), 'newid');
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 2);
        });

        it('recreate skips already recreated items', async () => {
            const reporter = new Reporter(new ReportingCategory(''));
            let count = 0;
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProvider,

                    /**
                     * Find the newID for a given oldID, in case the oldID was already imported previously in another run.
                     */
                    findExisting(oldItem: TestObject) {
                        if (oldItem.id === '2') {
                            // Already done
                            return Promise.resolve(new TestObject('newid2', 'name2'));
                        }
                        return Promise.resolve(undefined);
                    },

                    /**
                     * Recreate an existing item in the new account.
                     */
                    recreate(oldItem: TestObject, tags: ReportTags) {
                        count += 1;
                        return baseProvider.recreate(oldItem, tags);
                    }
                }
            });

            await importer.recreateAll();
            assert.equal(reporter.totalCount, 2);
            assert.equal(count, 1);
        });

        it('logs warnings in case of skipped items', async () => {
            const reporter = new Reporter(new ReportingCategory(''));
            let count = 0;
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProvider,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    recreate(oldItem: TestObject, tags: ReportTags) {
                        count += 1;

                        tags.addTag('reason', `Test`);
                        throw new ImportWarning({
                            message: `Skipped test`
                        });
                    }
                }
            });

            await importer.recreateAll();
            assert.equal(reporter.totalCount, 2);
            assert.equal(count, 2);
        });

        it('logs errors in case of recreation errors', async () => {
            const reporter = new Reporter(new ReportingCategory(''));
            let count = 0;
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProvider,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    recreate(oldItem: TestObject, tags: ReportTags) {
                        count += 1;

                        throw new ImportError({
                            message: `Failed recreate test`
                        });
                    }
                }
            });

            await assert.rejects(importer.recreateAll());
            assert.equal(reporter.totalCount, 2);
            assert.equal(count, 2);
        });
    });

    describe('Revert', () => {
        it('revertByID', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    revert(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        assert.equal(oldItem.id, '1');
                        assert.equal(newItem.id, 'newid1');
                        return Promise.resolve();
                    }
                }
            });

            await importer.revertByID('1');
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 1);

            // Noop
            await importer.revertByID('1');
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 1);
        });

        it('revert is optional for providers', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,
                    revert: undefined
                }
            });

            await importer.revertByID('1');
            assert.equal(reporter.totalCount, 0);
        });

        it('revertAll', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    revert(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        return Promise.resolve();
                    }
                }
            });

            await importer.revertAll();
            assert.equal(count, 2);
            assert.equal(reporter.totalCount, 2);
        });

        it('revertAll with skipped warnings', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    revert(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        tags.addTag('reason', `Test`);
                        throw new ImportWarning({
                            message: `Skipped test`
                        });
                    }
                }
            });

            await importer.revertAll();
            assert.equal(count, 2);
            assert.equal(reporter.totalCount, 2);
        });

        it('revertAll with fatal errors', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    revert(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        tags.addTag('reason', `Test`);

                        throw new ImportError({
                            message: `Failed to revert`
                        });
                    }
                }
            });

            await assert.rejects(importer.revertAll());
            assert.equal(count, 2);
            assert.equal(reporter.totalCount, 2);
        });

        it('revertAll is skipped if not yet recreated', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProvider,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    revert(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        return Promise.resolve();
                    }
                }
            });

            await importer.revertAll();
            assert.equal(count, 0);
            assert.equal(reporter.totalCount, 2);
        });

        it('revertByObjectOrId - id', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    revert(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        return Promise.resolve();
                    }
                }
            });

            await importer.revertByObjectOrId('1');
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 1);
        });

        it('revertByObjectOrId - object', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    revert(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        return Promise.resolve();
                    }
                }
            });

            await importer.revertByObjectOrId(new TestObject('1', 'test'));
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 1);

            // Noop
            await importer.revertByObjectOrId(new TestObject('1', 'test'));
            assert.equal(count, 1);
            assert.equal(reporter.totalCount, 1);
        });
    });

    describe('Confirm', () => {
        it('confirm is optional for providers', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,
                    confirm: undefined
                }
            });

            await importer.confirmAll();
            assert.equal(reporter.totalCount, 0);
        });

        it('confirmAll', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    confirm(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        return Promise.resolve();
                    }
                }
            });

            await importer.confirmAll();
            assert.equal(count, 2);
            assert.equal(reporter.totalCount, 2);

            // Noop
            await importer.confirmAll();
            assert.equal(count, 2);
            assert.equal(reporter.totalCount, 2);
        });

        it('confirmAll with skipped warnings', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    confirm(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        tags.addTag('reason', `Test`);
                        throw new ImportWarning({
                            message: `Skipped test`
                        });
                    }
                }
            });

            await importer.confirmAll();
            assert.equal(count, 2);
            assert.equal(reporter.totalCount, 2);
        });

        it('confirmAll with fatal errors', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProviderWithExisting,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    confirm(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        tags.addTag('reason', `Test`);

                        throw new ImportError({
                            message: `Failed to revert`
                        });
                    }
                }
            });

            await assert.rejects(importer.confirmAll());
            assert.equal(count, 2);
            assert.equal(reporter.totalCount, 2);
        });

        it('confirmAll is skipped if not yet recreated', async () => {
            let count = 0;
            const reporter = new Reporter(new ReportingCategory(''));
            const importer = new Importer({
                objectName: 'test',
                reporter,
                provider: {
                    ...baseProvider,

                    /**
                     * Recreate an existing item in the new account.
                     */
                    confirm(oldItem: TestObject, newItem: TestObject, tags: ReportTags) {
                        // noop
                        count += 1;
                        return Promise.resolve();
                    }
                }
            });

            await importer.confirmAll();
            assert.equal(count, 0);
            assert.equal(reporter.totalCount, 2);
        });
    });
});
