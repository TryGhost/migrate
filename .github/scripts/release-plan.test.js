import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';
import {getReleasePlan} from './release-plan.js';

function repository(t) {
    const cwd = mkdtempSync(join(tmpdir(), 'migrate-release-'));
    t.after(() => rmSync(cwd, {recursive: true, force: true}));
    const git = (...args) =>
        execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            env: {
                ...process.env,
                GIT_CONFIG_GLOBAL: '/dev/null',
                GIT_CONFIG_NOSYSTEM: '1',
                GIT_AUTHOR_NAME: 'Developer',
                GIT_AUTHOR_EMAIL: 'developer@example.com',
                GIT_COMMITTER_NAME: 'Developer',
                GIT_COMMITTER_EMAIL: 'developer@example.com'
            }
        });
    git('init', '--quiet', '--initial-branch=main');
    let commitCount = 0;
    const commit = (author = 'Developer <developer@example.com>') =>
        git('commit', '--quiet', '--allow-empty', '--author', author, '-m', `Change ${++commitCount}`);
    commit();
    git('tag', '@tryghost/migrate@1.0.0');
    return {git, commit, plan: options => getReleasePlan({cwd, ...options})};
}

describe('automatic release planning', () => {
    it('skips when there are no commits since the last stable CLI release', t => {
        const {plan} = repository(t);
        assert.equal(plan().publish, false);
        assert.equal(plan({bump: 'minor'}).publish, false);
    });

    it('uses patch for Renovate-only changes, including mixed-case author names', t => {
        const {commit, plan} = repository(t);
        commit('Renovate[bot] <renovate@example.com>');
        commit('renovate[bot] <bot@example.com>');
        assert.equal(plan().bump, 'patch');
        assert.equal(plan().release, true);
    });

    it('uses minor when any commit is from a person', t => {
        const {commit, plan} = repository(t);
        commit('renovate[bot] <renovate@example.com>');
        commit();
        assert.equal(plan().bump, 'minor');
        assert.equal(plan().commitCount, 2);
    });

    it('honours manual bumps and forces a patch when there are no new commits', t => {
        const {commit, plan} = repository(t);
        assert.equal(plan({force: true}).publish, true);
        assert.equal(plan({force: true}).bump, 'patch');
        assert.equal(plan({force: true, bump: 'minor'}).bump, 'minor');
        commit();
        assert.equal(plan({bump: 'patch'}).bump, 'patch');
    });

    it('ignores prereleases, unrelated package tags, and releases on unmerged branches', t => {
        const {git, commit, plan} = repository(t);
        git('checkout', '--quiet', '-b', 'future');
        commit();
        git('tag', '@tryghost/migrate@99.0.0');
        git('checkout', '--quiet', 'main');
        commit();
        git('tag', '@tryghost/migrate@1.1.0-0');
        git('tag', '@tryghost/mg-utils@99.0.0');
        assert.equal(plan().lastTag, '@tryghost/migrate@1.0.0');
        assert.equal(plan().commitCount, 1);
        assert.equal(plan().publish, true);
    });

    it('advances the baseline after a stable release and supports an untagged repository', t => {
        const {git, commit, plan} = repository(t);
        commit();
        git('tag', '@tryghost/migrate@1.1.0');
        assert.equal(plan().lastTag, '@tryghost/migrate@1.1.0');
        assert.equal(plan().publish, false);
        git('tag', '-d', '@tryghost/migrate@1.0.0', '@tryghost/migrate@1.1.0');
        assert.equal(plan().lastTag, '');
        assert.equal(plan().commitCount, 2);
    });

    it('preserves existing publishing modes without creating another release', () => {
        for (const mode of ['oidc-check', 'dry-run', 'publish']) {
            assert.deepEqual(getReleasePlan({mode, tag: 'beta'}), {publish: true, release: false, mode, tag: 'beta'});
        }
    });

    it('always publishes automatic releases to latest and rejects unknown options', t => {
        const {commit, plan} = repository(t);
        commit();
        assert.equal(plan({tag: 'beta'}).tag, 'latest');
        assert.throws(() => plan({mode: 'invalid'}), /Unknown release mode/);
        assert.throws(() => plan({bump: 'major'}), /Unknown version bump/);
        assert.throws(() => plan({tag: 'latest\nrelease=true'}), /Invalid npm dist-tag/);
    });
});
