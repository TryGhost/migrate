#!/usr/bin/env node

const prettyCLI = require('@tryghost/pretty-cli');

prettyCLI.preface('Command line utilities for migrating content to Ghost.');

prettyCLI.commandDirectory('../commands');

prettyCLI.style({
    usageCommandPlaceholder: () => '<source or utility>'
});

prettyCLI.groupOrder([
    'Sources:',
    'Utilities:',
    'Commands:',
    'Arguments:',
    'Required Options:',
    'Options:',
    'Global Options:'
]);

prettyCLI.parseAndExit();
