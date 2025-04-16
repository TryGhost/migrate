import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import substack from '../sources/substack.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'substack';

const group = 'Sources:';

// The command to run and any params
const flags = 'substack';

// Description for the top level command
const desc = 'Migrate from a Substack ZIP file';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToZip',
        defaultValue: null,
        desc: 'Path to a zip file',
        required: true
    },
    {
        type: 'string',
        flags: '--url',
        defaultValue: null,
        desc: 'Site URL',
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
        flags: '--zip',
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    },
    {
        type: 'array',
        flags: '-s --scrape',
        choices: ['all', 'img', 'web', 'media', 'files', 'none'],
        defaultValue: ['all'],
        desc: 'Configure scraping tasks'
    },
    {
        type: 'number',
        flags: '--sizeLimit',
        defaultValue: false,
        desc: 'Assets larger than this size (defined in MB) will be ignored'
    },
    {
        type: 'string',
        flags: '-e --email',
        defaultValue: null,
        desc: 'Provide an email for users e.g. john@mycompany.com to create a general user w/ slug `john` and provided email'
    },
    {
        type: 'string',
        flags: '--addTag',
        defaultValue: null,
        desc: 'Provide a tag slug which should be added to every post in this migration'
    },
    {
        type: 'boolean',
        flags: '--addPlatformTag',
        defaultValue: true,
        desc: 'Add #substack tag to migrated content'
    },
    {
        type: 'boolean',
        flags: '--addTypeTag',
        defaultValue: true,
        desc: 'Add #substack-{type} tag to migrated content (post, podcast, etc)'
    },
    {
        type: 'boolean',
        flags: '--addAccessTag',
        defaultValue: true,
        desc: 'Add #substack-{access} tag to migrated content (public, paid, etc)'
    },
    {
        type: 'boolean',
        flags: '--posts',
        defaultValue: true,
        desc: 'Import posts'
    },
    {
        type: 'boolean',
        flags: '--drafts',
        defaultValue: true,
        desc: 'Import draft posts'
    },
    {
        type: 'boolean',
        flags: '--pages',
        defaultValue: true,
        desc: 'Import pages'
    },
    {
        type: 'boolean',
        flags: '--podcasts',
        defaultValue: true,
        desc: 'Import podcasts'
    },
    {
        type: 'boolean',
        flags: '--threads',
        defaultValue: false,
        desc: 'Import threads'
    },
    {
        type: 'boolean',
        flags: '--useMetaImage',
        defaultValue: true,
        desc: 'Use "og:image" value as the feature image'
    },
    {
        type: 'boolean',
        flags: '--useFirstImage',
        defaultValue: true,
        desc: 'Use the first image in content as the feature image (useMetaImage takes priority)'
    },
    {
        type: 'boolean',
        flags: '--useMetaAuthor',
        defaultValue: true,
        desc: 'Use the author field from ld+json (useful for posts with multiple authors)'
    },
    {
        type: 'string',
        flags: '--subscribeLink',
        defaultValue: '#/portal/signup',
        desc: 'Provide a path that existing "subscribe" anchors will link to e.g. "/join-us" or "#/portal/signup" (# characters need to be escaped with a \\)'
    },
    {
        type: 'boolean',
        flags: '--comments',
        defaultValue: true,
        desc: 'Keep comment buttons'
    },
    {
        type: 'string',
        flags: '--commentLink',
        defaultValue: '#ghost-comments-root',
        desc: 'Provide a path that existing "comment" anchors will link to e.g. "#comments" or "#ghost-comments-root" (# characters need to be escaped with a \\)'
    },
    {
        type: 'string',
        flags: '--postsBefore',
        defaultValue: null,
        desc: 'Only migrate posts before and including a given date e.g. \'March 20 2018\''
    },
    {
        type: 'string',
        flags: '--postsAfter',
        defaultValue: null,
        desc: 'Only migrate posts after and including a given date e.g. \'August 16 2021\''
    },
    {
        type: 'number',
        flags: '--wait_after_scrape',
        defaultValue: 2000,
        desc: 'Time in ms to wait after a URL is scraped'
    },
    {
        type: 'boolean',
        flags: '--fallBackHTMLCard',
        defaultValue: true,
        desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
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
        desc: 'Provide a unique name for the cache directory (defaults to a UUID)'
    }
];

// Build an object of defaults to be exported - Not used here, but needs to be provided
const defaults = convertOptionsToDefaults(options);

// Convert `options` into a list of Sywac types
const setup = sywac => convertOptionsToSywac(options, sywac);

// What to do when this command is executed
const run = async (argv) => {
    let context = {
        errors: [],
        warnings: []
    };

    // Remove trailing slash from URL
    if (argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = substack.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose) {
            ui.log.info('Done', inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.error(error);
    }

    if (argv.verbose) {
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
