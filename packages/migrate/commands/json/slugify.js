import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import json from '../../lib/utilties/json.js';

const id = 'json-slugify';

const flags = 'slugify <pathToJSON>';

// Configure all the options
const setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
};

const desc = 'Add slugs to all post, tag & user resources';

const paramsDesc = ['Path to a Ghost JSON file to convert'];

// What to do when this command is executed
const run = async (argv) => {
    let timer = Date.now();
    let context = {errors: []};

    if (argv.verbose) {
        ui.log.info(`Running slug addition on ${argv.pathToJSON}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let utility = json.getTaskRunner('slugify', argv.pathToJSON, argv);

        // Run the migration
        await utility.run(context);

        if (argv.verbose) {
            ui.log.info('Done', inspect(context.result, false, 3));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    if (argv.verbose) {
        ui.log.info(`Cached files can be found at ${context.fileCache.cacheDir}`);
    }

    // Report success
    ui.log.ok(`Successfully written output to ${context.outputFile} in ${Date.now() - timer}ms.`);
};

export default {
    id,
    flags,
    desc,
    paramsDesc,
    setup,
    run
};
