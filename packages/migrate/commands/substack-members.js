const ui = require('@tryghost/pretty-cli').ui;
const substackMembers = require('../sources/substack-members');
const {parse, addYears} = require('date-fns');

// Internal ID in case we need one.
exports.id = 'substack-members';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'substack-members <pathToFile>';

// Description for the top level command
exports.desc = 'Migrate from Substack subscribers CSV';

// Descriptions for the individual params
exports.paramsDesc = ['Path to the signups CSV file as generated by Substack ("Total Email List").'];

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
    sywac.string('--subs', {
        defaultValue: null,
        desc: 'Path to the subscribers CSV file (paid, comp, gift) as generated by Substack ("Subscribers").'
    });
    sywac.number('-l, --limit', {
        defaultValue: 6000,
        desc: 'Define the batch limit for import files.'
    });
    sywac.string('--comp', {
        defaultValue: '10:free',
        choices: ['YY:none', 'YY:free', 'YYYYMMDD:none', 'YYYYMMDD:free'],
        desc: 'Provide two values in the format "YY|YYYYMMDD:none|free". YY is the threshold in years or YYYYMMDD as the exact date after which Substack `comp` members should receive a complimentary plan depending on the expiry date. "none|free" the option how to import members before this threshold, e. g. 5:free'
    });
    sywac.string('--gift', {
        defaultValue: '10:free',
        choices: ['YY:none', 'YY:free', 'YYYYMMDD:none', 'YYYYMMDD:free'],
        desc: 'Provide two values in the format "YY|YYYYMMDD:none|free". YY is the threshold in years or YYYYMMDD as the exact date after which Substack `gift` members should receive a complimentary plan depending on the expiry date. "none|free" the option how to import members before this threshold, e. g. 5:free'
    });
    sywac.string('--compLabel', {
        defaultValue: 'substack-comp',
        desc: 'Provide a label for Substack `comp` subscribers'
    });
    sywac.string('--giftLabel', {
        defaultValue: 'substack-gift',
        desc: 'Provide a label for Substack `gift` subscribers'
    });
    sywac.string('--freeLabel', {
        defaultValue: 'substack-free',
        desc: 'Provide a label for Substack free subscribers'
    });
    sywac.string('--paidLabel', {
        defaultValue: 'substack-paid',
        desc: 'Provide a label for Substack paid subscribers'
    });
};

const parseCompGift = (val) => {
    let [yearsOrDate, before] = val.split(':');

    try {
        if (yearsOrDate.length >= 4) {
            // try parsing the date into a valid UTC date
            yearsOrDate = parse(`${yearsOrDate}Z`, 'yyyyMMdX', addYears(new Date(), 10));
        } else {
            yearsOrDate = parseInt(yearsOrDate);
        }
    } catch (error) {
        ui.log.info('Failed to parse passed in date/years for threshold, falling back to 10. Ensure the correct format');
        yearsOrDate = 10;
    }
    return {
        thresholdYearOrDate: yearsOrDate,
        beforeThreshold: before
    };
};

// What to do when this command is executed
exports.run = async (argv) => {
    let timer = Date.now();
    let context = {errors: []};

    if (argv.subs) {
        argv.hasSubscribers = true;
    }

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToFile}${argv.subs ? ` and ${argv.subs}` : ``}`);
    }

    argv.comp = parseCompGift(argv.comp);
    argv.gift = parseCompGift(argv.gift);

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = substackMembers.getTaskRunner(argv.pathToFile, argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose) {
            ui.log.info('Done', require('util').inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    if (argv.verbose) {
        ui.log.info(`Cached files can be found at ${context.fileCache.cacheDir}`);

        if (context.logs) {
            ui.log.info(`Adjusted members due to passed in options:`);

            context.logs.forEach((log) => {
                ui.log.info(log.info);
            });
        }
    }

    if (context.result.skip) {
        context.result.skip.forEach((skipped) => {
            ui.log.warn(`Skipped import: ${skipped.reason}`);
        });
    }

    // Report success
    ui.log.ok(`Successfully written output to ${context.outputFile} in ${Date.now() - timer}ms.`);
};
