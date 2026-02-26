import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {join} from 'node:path';
import {memberStats} from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');

describe('Medium Members', () => {
    it('Can read number if entries in a txt file', async () => {
        const processed = await memberStats({txtPath: join(fixturesPath, 'members.txt')});

        assert.equal(processed.allMembers, 5);
    });

    it('Throws error is no path provided', async () => {
        await assert.rejects(
            async () => {
                // Prevent TS from erroring. This is intentional to test functionality.
                // @ts-ignore: Unreachable code error
                await memberStats({});
            },
            (error: Error) => {
                assert.strictEqual(error.name, 'BadRequestError');
                assert.strictEqual(error.message, 'No file path provided');
                return true;
            }
        );
    });

    it('Throws error no file exists at given path', async () => {
        await assert.rejects(
            async () => {
                await memberStats({txtPath: join(fixturesPath, 'non-existent-members.txt')});
            },
            (error: Error) => {
                assert.strictEqual(error.name, 'BadRequestError');
                assert.strictEqual(error.message, 'File not found');
                return true;
            }
        );
    });
});
