import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const GHOST_REPOSITORY = 'TryGhost/Ghost';
const GHOST_SCHEMA_PATH = 'ghost/core/core/server/data/schema/schema.js';
const OUTPUT_PATH = fileURLToPath(new URL('../src/lib/ghost-schema.ts', import.meta.url));

const FIELD_SOURCES = {
    post: {
        title: ['posts', 'title'],
        slug: ['posts', 'slug'],
        html: ['posts', 'html'],
        mobiledoc: ['posts', 'mobiledoc'],
        lexical: ['posts', 'lexical'],
        comment_id: ['posts', 'comment_id'],
        plaintext: ['posts', 'plaintext'],
        feature_image: ['posts', 'feature_image'],
        feature_image_alt: ['posts_meta', 'feature_image_alt'],
        feature_image_caption: ['posts_meta', 'feature_image_caption'],
        custom_excerpt: ['posts', 'custom_excerpt'],
        codeinjection_head: ['posts', 'codeinjection_head'],
        codeinjection_foot: ['posts', 'codeinjection_foot'],
        custom_template: ['posts', 'custom_template'],
        canonical_url: ['posts', 'canonical_url'],
        og_image: ['posts_meta', 'og_image'],
        og_title: ['posts_meta', 'og_title'],
        og_description: ['posts_meta', 'og_description'],
        twitter_image: ['posts_meta', 'twitter_image'],
        twitter_title: ['posts_meta', 'twitter_title'],
        twitter_description: ['posts_meta', 'twitter_description'],
        meta_title: ['posts_meta', 'meta_title'],
        meta_description: ['posts_meta', 'meta_description']
    },
    tag: {
        name: ['tags', 'name'],
        slug: ['tags', 'slug'],
        description: ['tags', 'description'],
        feature_image: ['tags', 'feature_image'],
        og_image: ['tags', 'og_image'],
        og_title: ['tags', 'og_title'],
        og_description: ['tags', 'og_description'],
        twitter_image: ['tags', 'twitter_image'],
        twitter_title: ['tags', 'twitter_title'],
        twitter_description: ['tags', 'twitter_description'],
        meta_title: ['tags', 'meta_title'],
        meta_description: ['tags', 'meta_description'],
        codeinjection_head: ['tags', 'codeinjection_head'],
        codeinjection_foot: ['tags', 'codeinjection_foot'],
        canonical_url: ['tags', 'canonical_url']
    },
    author: {
        name: ['users', 'name'],
        slug: ['users', 'slug'],
        email: ['users', 'email'],
        profile_image: ['users', 'profile_image'],
        cover_image: ['users', 'cover_image'],
        bio: ['users', 'bio'],
        website: ['users', 'website'],
        location: ['users', 'location'],
        facebook: ['users', 'facebook'],
        twitter: ['users', 'twitter'],
        meta_title: ['users', 'meta_title'],
        meta_description: ['users', 'meta_description']
    }
};

function parseArguments(args) {
    const options = {ref: 'main', source: null, commit: null, check: false};

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === '--check') {
            options.check = true;
        } else if (argument === '--ref' || argument === '--source' || argument === '--commit') {
            const value = args[index + 1];
            if (!value) {
                throw new Error(`Missing value for ${argument}`);
            }
            options[argument.slice(2)] = value;
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }

    if (options.source && !options.commit) {
        throw new Error('--source requires --commit so the generated profile stays versioned');
    }

    return options;
}

async function fetchText(url) {
    const response = await fetch(url, {
        headers: {
            accept: 'application/vnd.github+json',
            'user-agent': '@tryghost/mg-context schema sync'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return await response.text();
}

async function loadSource({ref, source, commit}) {
    if (source) {
        return {
            commit,
            source: await readFile(resolve(source), 'utf8')
        };
    }

    const commitResponse = JSON.parse(
        await fetchText(`https://api.github.com/repos/${GHOST_REPOSITORY}/commits/${encodeURIComponent(ref)}`)
    );
    const resolvedCommit = commitResponse.sha;
    if (typeof resolvedCommit !== 'string' || !/^[a-f0-9]{40}$/.test(resolvedCommit)) {
        throw new Error(`Could not resolve Ghost ref ${ref}`);
    }

    const rawUrl = `https://raw.githubusercontent.com/${GHOST_REPOSITORY}/${resolvedCommit}/${GHOST_SCHEMA_PATH}`;
    return {
        commit: resolvedCommit,
        source: await fetchText(rawUrl)
    };
}

function parseSchema(source) {
    const sandbox = {module: {exports: {}}};
    vm.runInNewContext(source, sandbox, {filename: GHOST_SCHEMA_PATH, timeout: 1000});
    return sandbox.module.exports;
}

function effectiveMaxLength(column, location) {
    const validationMax = column?.validations?.isLength?.max;
    const maxLength = validationMax ?? column?.maxlength;

    if (!Number.isInteger(maxLength) || maxLength <= 0) {
        throw new Error(`No positive maximum length found for ${location}`);
    }

    return maxLength;
}

function extractLimits(schema) {
    const limits = {};

    for (const [context, fields] of Object.entries(FIELD_SOURCES)) {
        limits[context] = {};
        for (const [field, [table, column]] of Object.entries(fields)) {
            limits[context][field] = effectiveMaxLength(schema[table]?.[column], `${table}.${column}`);
        }
    }

    return limits;
}

function renderObject(value, indent = 0) {
    const padding = ' '.repeat(indent);
    const entries = Object.entries(value);
    const lines = entries.map(([key, child], index) => {
        const suffix = index === entries.length - 1 ? '' : ',';
        if (typeof child === 'object') {
            return `${padding}    ${key}: ${renderObject(child, indent + 4)}${suffix}`;
        }
        return `${padding}    ${key}: ${child}${suffix}`;
    });

    return `{
${lines.join('\n')}
${padding}}`;
}

function renderProfile(commit, limits) {
    const sourceUrl = `https://github.com/${GHOST_REPOSITORY}/blob/${commit}/${GHOST_SCHEMA_PATH}`;

    return `// This file is generated by ../../scripts/sync-ghost-schema.mjs.
// Update it with \`pnpm sync:ghost-schema\`; do not edit field limits by hand.

export const GHOST_SCHEMA_VERSION = '${commit}';
export const GHOST_SCHEMA_SOURCE =
    '${sourceUrl}';

export const GHOST_FIELD_LIMITS = ${renderObject(limits)} as const;
`;
}

const options = parseArguments(process.argv.slice(2));
const {commit, source} = await loadSource(options);
const output = renderProfile(commit, extractLimits(parseSchema(source)));

if (options.check) {
    const existing = await readFile(OUTPUT_PATH, 'utf8');
    if (existing !== output) {
        throw new Error('Ghost schema profile is stale. Run `pnpm sync:ghost-schema`.');
    }
    // eslint-disable-next-line no-console
    console.log(`Ghost schema profile is current at ${commit}`);
} else {
    await writeFile(OUTPUT_PATH, output);
    // eslint-disable-next-line no-console
    console.log(`Updated Ghost schema profile from ${commit}`);
}
