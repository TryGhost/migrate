import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import wixCSV from '../sources/wix-csv.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';
import {ghostAuthOptions} from '@tryghost/mg-ghost-authors';

const id = 'wix-csv';
const group = 'Sources:';
const flags = 'wix-csv';
const desc = 'Migrate from Wix using a posts CSV file';

const options = [
    {
        type: 'string',
        flags: '--posts',
        defaultValue: null,
        desc: 'Path to posts CSV file',
        required: true
    },
    {
        type: 'string',
        flags: '--url',
        defaultValue: null,
        desc: 'URL to live site',
        required: true
    },
    {
        type: 'string',
        flags: '--defaultAuthorName',
        defaultValue: null,
        desc: 'The full name of the default author to assign to posts, if one cannot be found'
    },
    {
        type: 'array',
        flags: '--scrape',
        choices: ['assets', 'none', 'img', 'media', 'files'],
        defaultValue: ['assets'],
        desc: 'Configure scraping tasks (assets = download assets, none = skip asset download). Legacy aliases for assets: img, media, files'
    },
    {
        type: 'boolean',
        flags: '--includeMainCategory',
        defaultValue: true,
        desc: 'Include the Main Category column as a Ghost tag'
    },
    {
        type: 'boolean',
        flags: '--includeCategories',
        defaultValue: true,
        desc: 'Include the Categories column as Ghost tags'
    },
    {
        type: 'boolean',
        flags: '--includeTags',
        defaultValue: true,
        desc: 'Include the Tags column as Ghost tags'
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
        desc: 'Provide a unique name for the cache directory (defaults to a UUID)'
    },
    {
        type: 'boolean',
        flags: '--cache',
        defaultValue: true,
        desc: 'Persist local cache after migration is complete (Only if `--zip` is `true`)'
    },
    {
        type: 'boolean',
        flags: '--zip',
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
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
    ...ghostAuthOptions
];

const defaults = convertOptionsToDefaults(options);
const setup = sywac => convertOptionsToSywac(options, sywac);

const run = async argv => {
    const context = {
        errors: [],
        warnings: []
    };

    if (argv.veryVerbose) {
        argv.verbose = true;
    }

    if (argv.url && argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    try {
        const migrate = wixCSV.getTaskRunner(argv);
        await migrate.run(context);

        if (argv.verbose && context.result) {
            ui.log.info('Done');
        }

        if (argv.veryVerbose && context.result) {
            ui.log.info(inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.error(error);
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
