/* eslint no-undef: 0 */
const {promisify} = require('util');
const exec = promisify(require('child_process').exec);

describe('CLI output', function () {
    test('outputs preface', async function () {
        try {
            const help = await exec('yarn dev --help');
            expect(help.stdout).toContain('Command line utilities for migrating content to Ghost.');
        } catch (error) {
            throw Error('CLI threw an error');
        }
    });
});
