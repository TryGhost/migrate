import {ui} from '@tryghost/pretty-cli';
import tinynews from '../sources/tinynews.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';
import {ghostAuthOptions} from '@tryghost/mg-ghost-authors';

// Internal ID in case we need one.
const id = 'tinynews';

const group = 'Sources:';

// The command to run and any params
const flags = 'tinynews';

// Description for the top level command
const desc = 'Migrate from Tiny News using JSON files';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--articles',
        defaultValue: null,
        desc: 'Path to articles JSON file',
        required: true
    },
    {
        type: 'string',
        flags: '--pages',
        defaultValue: null,
        desc: 'Path to pages JSON file',
        required: false
    },
    {
        type: 'string',
        flags: '--newsletters',
        defaultValue: null,
        desc: 'Path to newsletters JSON file (editions in data.newsletter_editions)',
        required: false
    },
    {
        type: 'string',
        flags: '--authors',
        defaultValue: null,
        desc: 'Path to authors JSON file (authors in data.authors)',
        required: false
    },
    {
        type: 'string',
        flags: '--url',
        defaultValue: null,
        desc: 'URL to live site (scopes the stable Ghost IDs and gives newsletters their old URLs)',
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
        choices: ['all', 'web', 'assets', 'none', 'img', 'media', 'files'],
        defaultValue: ['all'],
        desc: 'Configure scraping tasks (all = web + assets, web = metadata only, assets = download assets only). Legacy aliases for assets: img, media, files'
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
        desc: 'Read the JSON files again, replacing the stored source'
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
        desc: 'Provide a unique name for the cache directory (defaults to one based on the input file paths)'
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
        ui.log.info(`Migrating from Tiny News articles at ${argv.articles}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = tinynews.getTaskRunner(argv);

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
