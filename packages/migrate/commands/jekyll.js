import {ui} from '@tryghost/pretty-cli';
import jekyll from '../sources/jekyll.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';
import {ghostAuthOptions} from '@tryghost/mg-ghost-authors';

// Internal ID in case we need one.
const id = 'jekyll';

const group = 'Sources:';

// The command to run and any params
const flags = 'jekyll';

// Description for the top level command
const desc = 'Migrate from Jekyll using an export zip';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToZip',
        defaultValue: null,
        desc: 'Path to a Jekyll site zip, or the site directory, holding _posts/ and _drafts/',
        required: true
    },
    {
        type: 'string',
        flags: '-u --url',
        defaultValue: null,
        desc: 'URL to the live site (gives posts their old URLs and scopes the stable Ghost IDs)',
        required: true
    },
    {
        type: 'boolean',
        flags: '-V --verbose',
        defaultValue: Boolean(process?.env?.DEBUG),
        desc: 'Show verbose output'
    },
    {
        type: 'boolean',
        flags: '--veryVerbose',
        defaultValue: false,
        desc: 'Show very verbose output (implies --verbose)'
    },
    {
        type: 'boolean',
        flags: '--zip',
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    },
    {
        type: 'boolean',
        flags: '--report',
        defaultValue: false,
        desc: 'Write a .report.json migration report beside the import, or a .failed-report.json if the run fails'
    },
    {
        type: 'array',
        flags: '-s --scrape',
        choices: ['all', 'web', 'assets', 'none', 'img', 'media', 'files'],
        defaultValue: ['all'],
        desc: 'Configure scraping tasks (all = web + assets, web = metadata only, assets = download assets only). Legacy aliases for assets: img, media, files'
    },
    {
        type: 'string',
        flags: '-e --email',
        defaultValue: false,
        desc: 'Provide an email domain for users e.g. mycompany.com'
    },
    {
        type: 'string',
        flags: '--addTags',
        defaultValue: null,
        desc: 'Provide one or more tag names which should be added to every post in this migration'
    },
    {
        type: 'enumeration',
        flags: '--datedPermalinks',
        choices: ['none', '/yyyy/mm/', '/yyyy/mm/dd/'],
        defaultValue: 'none',
        desc: 'Set the dated permalink structure of the live site (e.g. /yyyy/mm/dd/), kept when rewriting links'
    },
    {
        type: 'boolean',
        flags: '--rereadSource',
        defaultValue: false,
        desc: 'Read the export again, replacing the stored source while preserving downloaded assets'
    },
    {
        type: 'number',
        flags: '--postsPerFile',
        defaultValue: 2000,
        desc: 'Maximum posts written per Ghost import JSON file'
    },
    {
        type: 'boolean',
        flags: '--cache',
        defaultValue: true,
        desc: 'Persist local cache after migration is complete (Only if `--zip` is `true`)'
    },
    {
        type: 'string',
        flags: '--tmpPath',
        defaultValue: null,
        desc: 'Specify the full path where the temporary files will be stored (Defaults a hidden tmp dir)'
    },
    {
        type: 'string',
        flags: '--outputPath',
        defaultValue: null,
        desc: 'Specify the full path where the final zip file will be saved to (Defaults to CWD)'
    },
    {
        type: 'string',
        flags: '--cacheName',
        defaultValue: null,
        desc: 'Provide a unique name for the cache directory (defaults to one based on the export path)'
    },
    ...ghostAuthOptions
];

// Build an object of defaults to be exported - Not used here, but needs to be provided
const defaults = convertOptionsToDefaults(options);

// Convert `options` into a list of Sywac types
const setup = sywac => convertOptionsToSywac(options, sywac);

// What to do when this command is executed
const run = async argv => {
    let context = {
        errors: [],
        warnings: []
    };

    if (argv.veryVerbose) {
        argv.verbose = true;
    }

    // Remove trailing slash from URL
    if (argv.url && argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = jekyll.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        ui.log.info(
            `${context.summary.imported} imported, ${context.summary.skipped} skipped, ${context.warningCount} warnings.${context.reportFile ? ` Report: ${context.reportFile.path}` : ''}`
        );
    } catch (error) {
        ui.log.error(error);
        process.exitCode = 1;
    }

    if (argv.verbose && context.fileCache) {
        ui.log.info(`Cached files can be found at ${context.fileCache.cacheDir}`);
    }
};

export default {
    id,
    group,
    flags,
    desc,
    setup,
    run,
    defaults
};
