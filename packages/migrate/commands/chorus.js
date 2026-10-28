import {ui} from '@tryghost/pretty-cli';
import chorus from '../sources/chorus.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';
import {ghostAuthOptions} from '@tryghost/mg-ghost-authors';

// Internal ID in case we need one.
const id = 'chorus';

const group = 'Sources:';

// The command to run and any params
const flags = 'chorus';

// Description for the top level command
const desc = 'Migrate from Chorus using a JSON export';

// Configure all the options
const options = [
    {
        type: 'array',
        flags: '--entries',
        defaultValue: null,
        desc: 'Path(s) to Chorus export zips, or directories of Entry:<id>.json files',
        required: true
    },
    {
        type: 'string',
        flags: '--url',
        defaultValue: null,
        desc: 'URL to live site (scopes the stable Ghost IDs)',
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
        flags: '--scrape',
        choices: ['all', 'web', 'none'],
        defaultValue: ['all'],
        desc: 'Configure scraping tasks (all and web scrape post metadata, none skips scraping)'
    },
    {
        type: 'string',
        flags: '--addPrimaryTag',
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post as primary tag'
    },
    {
        type: 'number',
        flags: '--wait_after_scrape',
        defaultValue: 200,
        desc: 'Time in ms to wait after a URL is scraped'
    },
    {
        type: 'boolean',
        flags: '--rereadSource',
        defaultValue: false,
        desc: 'Read the exports again, replacing the stored source'
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
        desc: 'Provide a unique name for the cache directory (defaults to one based on the export paths)'
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
    if (argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    // Remove empty array items from argv.entries
    argv.entries = argv.entries.filter(str => str !== '');

    if (argv.verbose) {
        ui.log.info(`Migrating from Chorus exports at ${argv.entries.join(', ')}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = chorus.getTaskRunner(argv);

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
