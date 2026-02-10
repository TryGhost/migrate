import {extname} from 'node:path';
import {inspect} from 'node:util';
import {readFileSync} from 'node:fs';
import {readJSON} from 'fs-extra/esm';
import {ui} from '@tryghost/pretty-cli';
import xml2json from 'xml2json';
import wpAPISource from '../sources/wp-api.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'wp-api';

const group = 'Sources:';

// The command to run and any params
const flags = 'wp-api';

// Description for the top level command
const desc = 'Migrate from WordPress using JSON API';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--url',
        defaultValue: null,
        desc: 'Path to a WordPress site',
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
        type: 'string',
        flags: '--onlyURLs',
        defaultValue: null,
        desc: 'Path to a CSV file of post URLs that will be the only migrated posts'
    },
    {
        type: 'array',
        flags: '-s --scrape',
        choices: ['all', 'web', 'assets', 'none', 'img', 'media', 'files'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks (all = web + assets, web = metadata only, assets = download assets only). Legacy aliases for assets: img, media, files'
    },
    {
        type: 'boolean',
        flags: '-I --info',
        defaultValue: false,
        desc: 'Show initalisation info only'
    },
    {
        type: 'number',
        flags: '-b --batch',
        defaultValue: 0,
        desc: 'Run a batch (defaults to not batching)'
    },
    {
        type: 'number',
        flags: '-l --limit',
        defaultValue: 100,
        desc: 'Number of items fetched in a batch i.e. batch size'
    },
    {
        type: 'number',
        flags: '--maxPosts',
        defaultValue: 0,
        desc: 'Maximum number of posts to return (defaults to not limit)'
    },
    {
        type: 'string',
        flags: '-a --auth',
        defaultValue: null,
        desc: 'Provide a user and password to authenticate the WordPress API (<user>:<password>)'
    },
    {
        type: 'string',
        flags: '-u --users',
        defaultValue: null,
        desc: 'Provide a JSON file with users'
    },
    {
        type: 'boolean',
        flags: '--posts',
        defaultValue: true,
        desc: 'Import posts'
    },
    {
        type: 'boolean',
        flags: '--pages',
        defaultValue: true,
        desc: 'Import pages'
    },
    {
        type: 'boolean',
        flags: '--rawHtml',
        defaultValue: false,
        desc: 'Don\'t process HTML and wrap in a HTML card'
    },
    {
        type: 'boolean',
        flags: '--fallBackHTMLCard',
        defaultValue: true,
        desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
    },
    {
        type: 'boolean',
        flags: '--tags',
        defaultValue: true,
        desc: 'Set to false if you don\'t want to import WordPress tags, only categories'
    },
    {
        type: 'string',
        flags: '--addTag',
        defaultValue: null,
        desc: 'Provide a tag slug which should be added to every post in this migration'
    },
    {
        type: 'string',
        flags: '--featureImage',
        defaultValue: 'featuredmedia',
        choices: ['featuredmedia', 'og:image', 'none'],
        desc: 'Change which value is used as the feature image'
    },
    {
        type: 'enumeration',
        flags: '--datedPermalinks',
        choices: ['none', '/yyyy/mm/', '/yyyy/mm/dd/', '/*/yyyy/mm/', '/*/yyyy/mm/dd/'],
        defaultValue: 'none',
        desc: 'Set the dated permalink structure (e.g. /yyyy/mm/dd/) [See readme for details]'
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
        type: 'array',
        flags: '--cpt',
        defaultValue: null,
        desc: 'The slug(s) of custom post type(s), e.g. `resources,newsletters`'
    },
    {
        type: 'boolean',
        flags: '--excerpt',
        defaultValue: true,
        desc: 'Use the excerpt value from WordPress API'
    },
    {
        type: 'string',
        flags: '--excerptSelector',
        defaultValue: null,
        desc: 'Pass in a valid selector to grab a custom excerpt from the post content, e. g. `h2.excerpt`'
    },
    {
        type: 'boolean',
        flags: '--featureImageCaption',
        defaultValue: true,
        desc: 'Include featured image captions'
    },
    {
        type: 'string',
        flags: '--removeSelectors',
        defaultValue: null,
        desc: 'Pass in a string of CSS selectors for elements that will be removed, e.g. \'.ads, script[src*="adnetwork.com"]\''
    },
    {
        type: 'boolean',
        flags: '--trustSelfSignedCert',
        defaultValue: false,
        desc: 'Trust self-signed certificates (such as for local installs)'
    },
    {
        type: 'string',
        flags: '--tmpPath',
        defaultValue: null,
        desc: 'Specify the full path where the temporary files will be stored (Defaults a hidden tmp dir)'
    },
    {
        type: 'boolean',
        flags: '--cache',
        defaultValue: true,
        desc: 'Persist local cache after migration is complete (Only if `--zip` is `true`)'
    },
    {
        type: 'string',
        flags: '--ghostApiUrl',
        defaultValue: null,
        desc: 'Ghost site URL to fetch existing users (e.g. https://example.ghost.io)'
    },
    {
        type: 'string',
        flags: '--ghostAdminKey',
        defaultValue: null,
        desc: 'Ghost Admin API key to authenticate with Ghost (format: id:secret)'
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

    if (argv.auth) {
        let auth = argv.auth.split(':');

        if (auth.length < 2 || auth.length >= 3) {
            ui.log.info('Not running in authenticated mode. Please provide the credentials in this format: <user>:<password>');
            context.apiUser = {};
        } else {
            ui.log.info('Using authentication for WordPress API');
            context.apiUser = {username: auth[0], password: auth[1]};
        }
    }

    if (argv.users) {
        const usersFileExt = extname(argv.users).replace('.', '').toLowerCase();

        if (usersFileExt === 'json') {
            context.usersJSON = await readJSON(argv.users);
        } else if (usersFileExt === 'xml') {
            const xmlData = readFileSync(argv.users, 'utf8');
            const userXMLJSON = xml2json.toJson(xmlData, {
                object: true
            });

            let usersObjects = [];

            userXMLJSON.root.row.forEach((user) => {
                usersObjects.push({
                    id: (user.source_user_id.length) ? parseInt(user.source_user_id) : null,
                    slug: (user.user_nicename.length) ? user.user_nicename : null,
                    name: (user.display_name.length) ? user.display_name : null,
                    description: (user.description.length) ? user.description : null,
                    email: (user.user_email.length) ? user.user_email : null,
                    url: (user.user_url.length) ? user.user_url : null
                });
            });

            context.usersJSON = usersObjects;
        } else {
            ui.log.warn(`${argv.users} is an unsupported file format. Should be JSON or XML`);
        }
    }

    if (argv.verbose) {
        ui.log.info(`${argv.info ? 'Fetching info' : 'Migrating'} from site at ${argv.url}`);
    }

    if (argv.batch !== 0) {
        ui.log.info(`Running batch ${argv.batch} (groups of ${argv.limit} posts)`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = wpAPISource.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.info && context.info) {
            let batches = context.info.batches.posts + context.info.batches.pages;
            ui.log.info(`Batch info: ${context.info.totals.posts} posts, ${context.info.totals.pages} pages, ${batches} batches.`);
        }

        if (argv.verbose) {
            ui.log.info('Done', inspect(context.result.data, false, 2));
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
