const wpAPISource = require('../sources/wp-api');
const ui = require('@tryghost/pretty-cli').ui;

// Internal ID in case we need one.
exports.id = 'wp-api';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'wp-api <url>';

// Description for the top level command
exports.desc = 'Migrate from WordPress using JSON API';

// Descriptions for the individual params
exports.paramsDesc = ['Path to a WordPress site'];

// Configure all the options
exports.setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.boolean('--zip', {
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    });
    sywac.enumeration('-s --scrape', {
        choices: ['all', 'img', 'none'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks'
    });
    sywac.boolean('-I, --info', {
        defaultValue: false,
        desc: 'Show initalisation info only'
    });
    sywac.number('-b, --batch', {
        defaultValue: 0,
        desc: 'Run a batch (defaults to not batching)'
    });
    sywac.string('-a, --auth', {
        defaultValue: null,
        desc: 'Provide a user and password to authenticate the WordPress API (<user>:<password>)'
    });
    sywac.string('-u, --users', {
        defaultValue: null,
        desc: 'Provide a JSON file with users'
    });
};

// What to do when this command is executed
exports.run = async (argv) => {
    let timer = Date.now();
    let context = {errors: []};

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
        context.usersJSON = argv.users;
    }

    if (argv.verbose) {
        ui.log.info(`${argv.info ? 'Fetching info' : 'Migrating'} from site at ${argv.url}`);
    }

    if (argv.batch !== 0) {
        ui.log.info(`Running batch ${argv.batch} (groups of 100 posts)`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = wpAPISource.getTaskRunner(argv.url, argv);

        // Run the migration
        await migrate.run(context);

        if (argv.info && context.info) {
            let batches = context.info.batches.posts + context.info.batches.pages;
            ui.log.info(`Batch info: ${context.info.totals.posts} posts, ${context.info.totals.pages} pages, ${batches} batches.`);
        }

        if (argv.verbose) {
            ui.log.info('Done', require('util').inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    // Report success
    ui.log.ok(`Successfully written output to ${context.outputFile} in ${Date.now() - timer}ms.`);
};
