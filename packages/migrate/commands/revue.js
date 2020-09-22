const revue = require('../sources/revue');
const ui = require('@tryghost/pretty-cli').ui;

// Internal ID in case we need one.
exports.id = 'revue';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'revue [pubName] <apitoken>';

// Description for the top level command
exports.desc = 'Migrate from Revue using the API';

// Descriptions for the individual params
exports.paramsDesc = ['Revue profile name (e. g. https://www.getrevue.co/profile/<pubName>)', 'Revue API Token'];

// Configure all the options
exports.setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.boolean('-z, --zip', {
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    });
    sywac.enumeration('-s --scrape', {
        choices: ['all', 'web', 'img', 'none'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks'
    });
    sywac.string('--addPrimaryTag', {
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post as primary tag'
    });
    sywac.string('-e --email', {
        defaultValue: null,
        desc: 'Provide an email for users e.g. john@mycompany.com to create a general author for the posts'
    });
    sywac.boolean('-I, --info', {
        defaultValue: false,
        desc: 'Show Revue API info only'
    });
    sywac.boolean('--fallBackHTMLCard', {
        defaultValue: false,
        desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
    });
};

// What to do when this command is executed
exports.run = async (argv) => {
    let timer = Date.now();
    let context = {errors: []};

    if (argv.pubName.indexOf('http') >= 0) {
        return ui.log.error('Please provide Revue profile name without URL (e. g. https://www.getrevue.co/profile/<pubName>)');
    }

    if (argv.verbose) {
        ui.log.info(`${argv.info ? 'Fetching info' : 'Migrating'} from Revue site`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = revue.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.info && context.info) {
            ui.log.info(`Fetched ${context.info.totals.posts} posts.`);
        }

        if (argv.verbose && context.result) {
            ui.log.info('Done', require('util').inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    if (!argv.info) {
        // Report success
        ui.log.ok(`Successfully written output to ${context.outputFile} in ${Date.now() - timer}ms.`);
    }
};
