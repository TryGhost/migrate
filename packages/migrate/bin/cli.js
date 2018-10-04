#!/usr/bin/env node

const prettyCLI = require('@tryghost/pretty-cli');

prettyCLI.commandDirectory('../commands');

prettyCLI.style({
    usageCommandPlaceholder: () => '<source>'
});

prettyCLI.groupOrder([
    'Sources:',
    'Commands:',
    'Arguments:',
    'Required Options:',
    'Options:',
    'Global Options:'
]);

prettyCLI.parseAndExit();
