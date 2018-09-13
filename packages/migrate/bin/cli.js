#!/usr/bin/env node

const medium = require('../lib/medium');

// Minimal little CLI Tool
const print = (...args) => {
    console.log(...args); // eslint-disable-line
};

require('yargs')
    .command('medium [pathToZip]', 'migrate from medium', (yargs) => {
        yargs
            .positional('pathToZip', {
                describe: 'path to a medium export zip'
            });
    }, (argv) => {
        if (argv.verbose) {
            print(`Migrating from export at ${argv.pathToZip}`);
        }

        medium.migrate(argv.pathToZip, argv.verbose);
    })
    .option('verbose', {
        alias: 'v',
        default: false
    })
    .argv;
