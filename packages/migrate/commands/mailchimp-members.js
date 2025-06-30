import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import mailchimpMembers from '../sources/mailchimp-members.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'mailchimp-members';

const group = 'Sources:';

// The command to run and any params
const flags = 'mailchimp-members';

// Description for the top level command
const desc = 'Migrate members from Mailchimp using a ZIP file or CSV files';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToZip',
        defaultValue: null,
        desc: 'Path to members ZIP file',
        required: false
    },
    {
        type: 'array',
        flags: '--pathToCsv',
        defaultValue: null,
        desc: 'Path to members CSV file(s)',
        required: false
    },
    {
        type: 'string',
        flags: '--addLabel',
        defaultValue: null,
        desc: 'Label to add to all members'
    },
    {
        type: 'boolean',
        flags: '--includeUnsubscribed',
        defaultValue: true,
        desc: 'Include unsubscribed members in the migration, but set to not receive emails'
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
        defaultValue: false,
        desc: 'Create a zip file (set to false to skip)'
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

    // Remove any empty paths cause my spaces in the `pathToCsv` argument string
    argv.pathToCsv = argv.pathToCsv.filter(path => path);

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = mailchimpMembers.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose && context.result) {
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
