import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import curated from '../sources/curated.js';

// Internal ID in case we need one.
const id = 'curated';

const group = 'Sources:';

// The command to run and any params
const flags = 'curated <pathToZip>';

// Description for the top level command
const desc = 'Migrate from Curated using an export zip';

// Descriptions for the individual params
const paramsDesc = ['Path to a curated export zip'];

// Configure all the options
const setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.boolean('--zip', {
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    });
    sywac.string('-e --email', {
        defaultValue: false,
        desc: 'Provide an email address for posts to attributed to e.g. john@example.com'
    });
    sywac.string('-n --name', {
        defaultValue: false,
        desc: 'Provide a name for posts to attributed to e.g. John'
    });
    sywac.string('-t --tag', {
        defaultValue: false,
        desc: 'Provide a tag to be applied to every post'
    });
    sywac.boolean('--fallBackHTMLCard', {
        defaultValue: false,
        desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
    });
    sywac.boolean('--cache', {
        defaultValue: true,
        desc: 'Persist local cache after migration is complete (Only if `--zip` is `true`)'
    });
};

// What to do when this command is executed
const run = async (argv) => {
    let timer = Date.now();
    let context = {errors: []};

    // Remove trailing slash from URL
    if (argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = curated.getTaskRunner(argv.pathToZip, argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose) {
            ui.log.info('Done', inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    // Report success
    if (argv.zip) {
        let outputFile = await context.outputFile;
        ui.log.ok(`Successfully written output to ${outputFile.path} in ${Date.now() - timer}ms.`);
    }
};

export default {
    id,
    group,
    flags,
    desc,
    paramsDesc,
    setup,
    run
};
