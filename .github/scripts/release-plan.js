import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function getReleasePlan({
    mode = 'release',
    bump = 'auto',
    force = false,
    tag = 'latest',
    cwd = process.cwd()
} = {}) {
    if (!['release', 'oidc-check', 'dry-run', 'publish'].includes(mode)) {
        throw new Error(`Unknown release mode: ${mode}`);
    }
    if (!['auto', 'patch', 'minor'].includes(bump)) {
        throw new Error(`Unknown version bump: ${bump}`);
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(tag)) {
        throw new Error(`Invalid npm dist-tag: ${tag}`);
    }

    if (mode !== 'release') {
        return {publish: true, release: false, mode, tag};
    }

    const git = args => execFileSync('git', args, {cwd, encoding: 'utf8'}).trim();
    // The CLI's stable tags mark releases of the migration toolkit. Ignore
    // prereleases and tags on branches that have not been merged into this HEAD.
    const stableTags = git(['tag', '--merged', 'HEAD', '--list', '@tryghost/migrate@*'])
        .split('\n')
        .filter(value => /^@tryghost\/migrate@\d+\.\d+\.\d+$/.test(value));
    const lastTag = stableTags.length
        ? git(['describe', '--tags', '--abbrev=0', ...stableTags.flatMap(value => ['--match', value]), 'HEAD'])
        : '';
    const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
    const commitCount = Number(git(['rev-list', '--count', range]));
    const authors = git(['log', '--format=%an <%ae>', range]);
    const bumpKind =
        bump !== 'auto'
            ? bump
            : commitCount === 0 || authors.split('\n').every(author => /renovate/i.test(author))
              ? 'patch'
              : 'minor';
    const release = commitCount > 0 || force;

    return {publish: release, release, mode: 'publish', tag: 'latest', bump: bumpKind, lastTag, commitCount};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const plan = getReleasePlan({
        mode: process.env.RELEASE_MODE || 'release',
        bump: process.env.RELEASE_BUMP || 'auto',
        force: process.env.RELEASE_FORCE === 'true',
        tag: process.env.NPM_TAG || 'latest'
    });
    appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(plan)
            .map(([key, value]) => `${key}=${value}\n`)
            .join('')
    );
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}
