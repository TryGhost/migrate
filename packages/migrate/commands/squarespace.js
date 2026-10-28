import {ui} from '@tryghost/pretty-cli';
import squarespace from '../sources/squarespace.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';
import {ghostAuthOptions} from '@tryghost/mg-ghost-authors';

// Internal ID in case we need one.
const id = 'squarespace';

const group = 'Sources:';

// The command to run and any params
const flags = 'squarespace';

// Description for the top level command
const desc = 'Migrate from a Squarespace XML';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToFile',
        defaultValue: null,
        desc: 'Path to xml file',
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
        type: 'boolean',
        flags: '--drafts',
        defaultValue: true,
        desc: 'Import draft posts'
    },
    {
        type: 'boolean',
        flags: '--posts',
        defaultValue: true,
        desc: 'Import Squarespace posts'
    },
    {
        type: 'boolean',
        flags: '--pages',
        defaultValue: false,
        desc: 'Import Squarespace pages'
    },
    {
        type: 'boolean',
        flags: '--tags',
        defaultValue: true,
        desc: "Set to false if you don't want to import Squarespace tags, only categories"
    },
    {
        type: 'string',
        flags: '--addTag',
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post in this migration'
    },
    {
        type: 'string',
        flags: '--removeSelectors',
        defaultValue: null,
        desc: 'Pass in a string of CSS selectors for elements that will be removed, e.g. \'.ads, script[src*="adnetwork.com"]\''
    },
    {
        type: 'boolean',
        flags: '--rereadSource',
        defaultValue: false,
        desc: 'Replace the stored XML source snapshot while preserving downloaded assets'
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
        desc: "Provide a unique name for the cache directory (defaults to one based on the export's full path)"
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

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToFile}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = squarespace.getTaskRunner(argv);

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
