import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';
import {ReportTags, Reporter, ReportingCategory} from '../../lib/importers/Reporter.js';
import sinon from 'sinon';
import {Logger} from '../../lib/Logger.js';
import chalk from 'chalk';

describe('Reporter', () => {
    let logStack: string[] = [];

    beforeEach(() => {
        Logger.init({verboseLevel: 0, debug: false});
        sinon.stub(Logger.shared, 'plain').callsFake((str) => {
            logStack.push(str);
        });
    });

    afterEach(() => {
        sinon.restore();
        logStack = [];
    });

    it('Can report and stringify correctly', async () => {
        const reporter = new Reporter(new ReportingCategory('Test', {}));
        const green = new ReportingCategory('Green', {});
        const red = new ReportingCategory('Red', {});

        const g = new ReportTags();
        g.addTag('tag1', 'value1');
        g.addTag('tag2', 'value2');
        reporter.report([green], g);

        const r = new ReportTags();
        r.addTag('tag1', 'value1');
        r.addTag('tag2', 'value2');
        reporter.report([red], r);

        const r2 = new ReportTags();
        r2.addTag('tag1', 'value1');
        reporter.report([red], r2);

        assert.equal(reporter.totalCount, 3);
        assert.equal(reporter.children.size, 2);
        assert.equal(reporter.toString(), '3 Test\n1 Green, 2 Red');
    });

    it('Stringify skipTitle', async () => {
        const reporter = new Reporter(new ReportingCategory('Test', {skipTitle: true}));
        const green = new ReportingCategory('Green', {});
        const red = new ReportingCategory('Red', {});

        const g = new ReportTags();
        g.addTag('tag1', 'value1');
        g.addTag('tag2', 'value2');
        reporter.report([green], g);

        const r = new ReportTags();
        r.addTag('tag1', 'value1');
        r.addTag('tag2', 'value2');
        reporter.report([red], r);

        const r2 = new ReportTags();
        r2.addTag('tag1', 'value1');
        reporter.report([red], r2);

        assert.equal(reporter.totalCount, 3);
        assert.equal(reporter.children.size, 2);
        assert.equal(reporter.toString(), '1 Green, 2 Red');
    });

    it('Stringify skipCount', async () => {
        const reporter = new Reporter(new ReportingCategory('Test', {skipCount: true}));
        const green = new ReportingCategory('Green', {});
        const red = new ReportingCategory('Red', {});

        const g = new ReportTags();
        g.addTag('tag1', 'value1');
        g.addTag('tag2', 'value2');
        reporter.report([green], g);

        const r = new ReportTags();
        r.addTag('tag1', 'value1');
        r.addTag('tag2', 'value2');
        reporter.report([red], r);

        const r2 = new ReportTags();
        r2.addTag('tag1', 'value1');
        reporter.report([red], r2);

        assert.equal(reporter.totalCount, 3);
        assert.equal(reporter.children.size, 2);
        assert.equal(reporter.toString(), 'Test\n1 Green, 2 Red');
    });

    it('Stringify returns empty string if skipping title without children', async () => {
        const reporter = new Reporter(new ReportingCategory('Test', {skipTitle: true}));

        assert.equal(reporter.totalCount, 0);
        assert.equal(reporter.children.size, 0);
        assert.equal(reporter.toString(), '');
    });

    it('Can listen for changes', () => {
        const listener = sinon.spy();
        const reporter = new Reporter(new ReportingCategory('Test'));
        reporter.addListener(listener);

        const green = new ReportingCategory('Green', {});
        const red = new ReportingCategory('Red', {});

        const g = new ReportTags();
        g.addTag('tag1', 'value1');
        g.addTag('tag2', 'value2');
        reporter.report([green, red], g);

        // Only call listener once
        assert.equal(listener.callCount, 1);
    });

    it('addChildReporter', () => {
        const listener = sinon.spy();
        const reporter = new Reporter(new ReportingCategory('Test'));
        reporter.addListener(listener);

        const green = new ReportingCategory('Green', {});
        const red = new ReportingCategory('Red', {});

        const g = new ReportTags();
        g.addTag('tag1', 'value1');
        g.addTag('tag2', 'value2');
        reporter.report([green, red], g);

        const rootReporter = new Reporter(new ReportingCategory('Root', {}));
        const listener2 = sinon.spy();
        rootReporter.addListener(listener2);
        rootReporter.addChildReporter(reporter);

        assert.equal(reporter.totalCount, 1);
        assert.equal(rootReporter.totalCount, 1);
        assert.equal(rootReporter.children.size, 1);

        const g2 = new ReportTags();
        g2.addTag('tag1', 'value1');
        g2.addTag('tag2', 'value2');
        reporter.report([green, red], g2);

        // Listeners are connected:
        assert.equal(listener.callCount, 2);
        assert.equal(listener2.callCount, 1);

        assert.equal(rootReporter.totalCount, 2);
        assert.equal(reporter.totalCount, 2);
    });

    it('addChildReporter duplicating throws an error', () => {
        const listener = sinon.spy();
        const reporter = new Reporter(new ReportingCategory('Test'));
        reporter.addListener(listener);

        const green = new ReportingCategory('Green', {});
        const red = new ReportingCategory('Red', {});

        const g = new ReportTags();
        g.addTag('tag1', 'value1');
        g.addTag('tag2', 'value2');
        reporter.report([green, red], g);

        const rootReporter = new Reporter(new ReportingCategory('Root'));
        rootReporter.addChildReporter(reporter);

        assert.throws(() => rootReporter.addChildReporter(reporter), /Reporter already has a child reporter for Test/);
    });

    describe('Print', () => {
        it('Without subcategories and with tags', async () => {
            const reporter = new Reporter(new ReportingCategory('Test', {}));
            const g = new ReportTags();
            g.addTag('color', 'red');
            g.addTag('size', 'small');
            reporter.report([], g);

            const r = new ReportTags();
            r.addTag('color', 'red');
            r.addTag('size', 'small');
            reporter.report([], r);

            const r2 = new ReportTags();
            r2.addTag('color', 'green');
            reporter.report([], r2);

            assert.equal(reporter.totalCount, 3);
            assert.equal(reporter.children.size, 0);
            assert.equal(reporter.toString(), '3 Test');

            reporter.print({});
            assert.equal(logStack.length, 4);

            assert.equal(logStack[0], 'By color:');
            assert.equal(logStack[1], '    ' + chalk.dim('- red: 2'));
            assert.equal(logStack[2], '    ' + chalk.dim('- green: 1'));
            assert.equal(logStack[3], `size: ${chalk.dim('small')} (2/3)`);
        });

        it('Missing tag for some values shows (others)', async () => {
            const reporter = new Reporter(new ReportingCategory('Test', {}));
            const g = new ReportTags();
            g.addTag('size', 'small');
            reporter.report([], g);

            const r = new ReportTags();
            r.addTag('size', 'medium');
            reporter.report([], r);

            const r2 = new ReportTags();
            // no size
            reporter.report([], r2);

            assert.equal(reporter.totalCount, 3);
            assert.equal(reporter.children.size, 0);

            reporter.print({});
            assert.equal(logStack.length, 4);

            assert.equal(logStack[0], 'By size:');
            assert.equal(logStack[1], '    ' + chalk.dim('- small: 1'));
            assert.equal(logStack[2], '    ' + chalk.dim('- medium: 1'));
            assert.equal(logStack[3], '    ' + chalk.dim('- (others): 1'));
        });

        it('Can print with invalid totalCount', async () => {
            const reporter = new Reporter(new ReportingCategory('Test', {}));
            const g = new ReportTags();
            g.addTag('size', 'small');
            reporter.report([], g);

            const r = new ReportTags();
            r.addTag('size', 'medium');
            reporter.report([], r);

            assert.equal(reporter.totalCount, 2);
            assert.equal(reporter.children.size, 0);

            reporter.totalCount = 1; // this is not allowed, but to simulate a bug

            reporter.print({});
            assert.equal(logStack.length, 4);

            assert.equal(logStack[0], 'By size:');
            assert.equal(logStack[1], '    ' + chalk.dim('- small: 1'));
            assert.equal(logStack[2], '    ' + chalk.dim('- medium: 1'));
            assert.equal(logStack[3], '    ' + chalk.dim('- (too many tracked - this is not good and needs fixing): 1'));
        });

        it('All the same tag', async () => {
            const reporter = new Reporter(new ReportingCategory('Test', {}));
            const g = new ReportTags();
            g.addTag('color', 'red');
            reporter.report([], g);

            const r = new ReportTags();
            r.addTag('color', 'red');
            reporter.report([], r);

            const r2 = new ReportTags();
            r2.addTag('color', 'red');
            reporter.report([], r2);

            assert.equal(reporter.totalCount, 3);
            assert.equal(reporter.children.size, 0);

            reporter.print({});
            assert.equal(logStack.length, 1);
            assert.equal(logStack[0], `color: ${chalk.dim('red')}`);
        });

        it('Child with skip title', async () => {
            const reporter = new Reporter(new ReportingCategory('Test', {}));
            const succeeded = new ReportingCategory('succeeded', {skipTitle: true});

            const g = new ReportTags();
            g.addTag('color', 'red');
            g.addTag('size', 'small');
            reporter.report([succeeded], g);

            const r = new ReportTags();
            r.addTag('color', 'red');
            r.addTag('size', 'small');
            reporter.report([succeeded], r);

            const r2 = new ReportTags();
            r2.addTag('color', 'green');
            reporter.report([succeeded], r2);

            assert.equal(reporter.totalCount, 3);
            assert.equal(reporter.children.size, 1);

            reporter.print({});
            assert.equal(logStack.length, 4);

            assert.equal(logStack[0], 'By color:');
            assert.equal(logStack[1], '    ' + chalk.dim('- red: 2'));
            assert.equal(logStack[2], '    ' + chalk.dim('- green: 1'));
            assert.equal(logStack[3], `size: ${chalk.dim('small')} (2/3)`);
        });

        it('Child with skip count', async () => {
            const reporter = new Reporter(new ReportingCategory('Test', {}));
            const succeeded = new ReportingCategory('succeeded', {skipCount: true});

            const g = new ReportTags();
            g.addTag('color', 'red');
            g.addTag('size', 'small');
            reporter.report([succeeded], g);

            const r = new ReportTags();
            r.addTag('color', 'red');
            r.addTag('size', 'small');
            reporter.report([succeeded], r);

            const r2 = new ReportTags();
            r2.addTag('color', 'green');
            reporter.report([succeeded], r2);

            assert.equal(reporter.totalCount, 3);
            assert.equal(reporter.children.size, 1);

            reporter.print({});
            assert.equal(logStack.length, 5);

            assert.equal(logStack[0], 'succeeded');
            assert.equal(logStack[1], '    ' + 'By color:');
            assert.equal(logStack[2], '    ' + '    ' + chalk.dim('- red: 2'));
            assert.equal(logStack[3], '    ' + '    ' + chalk.dim('- green: 1'));
            assert.equal(logStack[4], '    ' + `size: ${chalk.dim('small')} (2/3)`);
        });

        it('Child with disabled indent', async () => {
            const reporter = new Reporter(new ReportingCategory('Test', {}));
            const succeeded = new ReportingCategory('succeeded', {indentChildren: false});

            const g = new ReportTags();
            g.addTag('color', 'red');
            g.addTag('size', 'small');
            reporter.report([succeeded], g);

            const r = new ReportTags();
            r.addTag('color', 'red');
            r.addTag('size', 'small');
            reporter.report([succeeded], r);

            const r2 = new ReportTags();
            r2.addTag('color', 'green');
            reporter.report([succeeded], r2);

            assert.equal(reporter.totalCount, 3);
            assert.equal(reporter.children.size, 1);

            reporter.print({});
            assert.equal(logStack.length, 5);

            assert.equal(logStack[0], 'All succeeded (3)');
            assert.equal(logStack[1], 'By color:');
            assert.equal(logStack[2], '    ' + chalk.dim('- red: 2'));
            assert.equal(logStack[3], '    ' + chalk.dim('- green: 1'));
            assert.equal(logStack[4], `size: ${chalk.dim('small')} (2/3)`);
        });

        it('Child with skip count and custom title', async () => {
            const reporter = new Reporter(new ReportingCategory('Test', {}));
            const succeeded = new ReportingCategory('succeeded', {skipCount: true, title: 'Succeeded'});

            const g = new ReportTags();
            g.addTag('color', 'red');
            g.addTag('size', 'small');
            reporter.report([succeeded], g);

            const r = new ReportTags();
            r.addTag('color', 'red');
            r.addTag('size', 'small');
            reporter.report([succeeded], r);

            const r2 = new ReportTags();
            r2.addTag('color', 'green');
            reporter.report([succeeded], r2);

            assert.equal(reporter.totalCount, 3);
            assert.equal(reporter.children.size, 1);

            reporter.print({});
            assert.equal(logStack.length, 5);

            assert.equal(logStack[0], 'Succeeded');
            assert.equal(logStack[1], '    ' + 'By color:');
            assert.equal(logStack[2], '    ' + '    ' + chalk.dim('- red: 2'));
            assert.equal(logStack[3], '    ' + '    ' + chalk.dim('- green: 1'));
            assert.equal(logStack[4], '    ' + `size: ${chalk.dim('small')} (2/3)`);
        });

        it('Child with count all same child', async () => {
            const reporter = new Reporter(new ReportingCategory('Test', {}));
            const succeeded = new ReportingCategory('succeeded', {});

            const g = new ReportTags();
            g.addTag('color', 'red');
            g.addTag('size', 'small');
            reporter.report([succeeded], g);

            const r = new ReportTags();
            r.addTag('color', 'red');
            r.addTag('size', 'small');
            reporter.report([succeeded], r);

            const r2 = new ReportTags();
            r2.addTag('color', 'green');
            reporter.report([succeeded], r2);

            assert.equal(reporter.totalCount, 3);
            assert.equal(reporter.children.size, 1);

            reporter.print({});
            assert.equal(logStack.length, 5);

            assert.equal(logStack[0], 'All succeeded (3)');
            assert.equal(logStack[1], '    ' + 'By color:');
            assert.equal(logStack[2], '    ' + '    ' + chalk.dim('- red: 2'));
            assert.equal(logStack[3], '    ' + '    ' + chalk.dim('- green: 1'));
            assert.equal(logStack[4], '    ' + `size: ${chalk.dim('small')} (2/3)`);
        });

        it('Multiple children with counts', async () => {
            const reporter = new Reporter(new ReportingCategory('Test', {}));
            const succeeded = new ReportingCategory('succeeded', {});
            const failed = new ReportingCategory('failed', {});

            const g = new ReportTags();
            g.addTag('color', 'red');
            reporter.report([succeeded], g);

            const r2 = new ReportTags();
            r2.addTag('color', 'green');
            reporter.report([failed], r2);

            assert.equal(reporter.totalCount, 2);
            assert.equal(reporter.children.size, 2);

            reporter.print({});
            assert.equal(logStack.length, 4);

            assert.equal(logStack[0], '1 succeeded');
            assert.equal(logStack[1], '    ' + `color: ${chalk.dim('red')}`);
            assert.equal(logStack[2], '1 failed');
            assert.equal(logStack[3], '    ' + `color: ${chalk.dim('green')}`);
        });
    });
});
