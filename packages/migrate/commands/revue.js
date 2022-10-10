import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import Table from 'tty-table';
import revue from '../sources/revue.js';

// Internal ID in case we need one.
const id = 'revue';

const group = 'Sources:';

// The command to run and any params
const flags = 'revue [pubName] <apitoken>';

// Description for the top level command
const desc = 'Migrate from Revue using the API';

// Descriptions for the individual params
const paramsDesc = ['Revue profile name (e. g. https://www.getrevue.co/profile/<pubName>)', 'Revue API Token'];

// Configure all the options
const setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.boolean('-z, --zip', {
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    });
    sywac.enumeration('-s --scrape', {
        choices: ['all', 'img', 'web', 'media', 'none'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks'
    });
    sywac.number('--size_limit', {
        defaultValue: false,
        desc: 'Media files larger than this size (defined in MB) will be flagged as oversize'
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
const run = async (argv) => {
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

        if (context.sizeReports && argv.size_limit) {
            let tableColOpts = {
                headerAlign: 'left',
                headerColor: 'cyan',
                align: 'left',
                color: 'gray',
                formatter: function (cellValue) {
                    return this.style(cellValue, 'red', 'bold');
                }
            };

            Object.entries(context.sizeReports).forEach(([reportTypeKey, reportTypeValue]) => {
                let tableHeader = [
                    Object.assign({}, tableColOpts, {
                        alias: 'Bytes',
                        value: 'bytesSize'
                    }),
                    Object.assign({}, tableColOpts, {
                        alias: 'Source',
                        value: 'src'
                    })
                ];

                let tableRows = [];

                reportTypeValue.data.forEach((element) => {
                    tableRows.push(element);
                });

                if (tableRows.length) {
                    const out = Table(tableHeader, tableRows, {compact: true}).render();
                    ui.log.warn(`${tableRows.length} '${reportTypeKey}' ${(tableRows.length === 1) ? 'file' : 'files'} is too large - Full report at ${reportTypeValue.path}`, out);
                } else {
                    ui.log.ok(`All files are ${reportTypeKey} are OK - Full report at ${reportTypeValue.path}`);
                }
            });
        }

        if (argv.verbose && context.result) {
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
