#!/usr/bin/env node
import prettyCLI from '@tryghost/pretty-cli';

prettyCLI.preface('Command line utilities for migrating content to Ghost.');


import cacheCommands from '../commands/cache.js';
prettyCLI.command(cacheCommands);

import curatedMembersCommands from '../commands/curated-members.js';
prettyCLI.command(curatedMembersCommands);

import curatedCommands from '../commands/curated.js';
prettyCLI.command(curatedCommands);

import ghostCommands from '../commands/ghost.js';
prettyCLI.command(ghostCommands);

import hubspotCommands from '../commands/hubspot.js';
prettyCLI.command(hubspotCommands);

import jekyllCommands from '../commands/jekyll.js';
prettyCLI.command(jekyllCommands);

import jsonEmailCommands from '../commands/json/email.js';
prettyCLI.command(jsonEmailCommands);

import jsonHtmlCardCommands from '../commands/json/html-card.js';
prettyCLI.command(jsonHtmlCardCommands);

import jsonHtmlCommands from '../commands/json/html.js';
prettyCLI.command(jsonHtmlCommands);

import jsonSlugifyCommands from '../commands/json/slugify.js';
prettyCLI.command(jsonSlugifyCommands);

import jsonCommands from '../commands/json.js';
prettyCLI.command(jsonCommands);

import mediumCommands from '../commands/medium.js';
prettyCLI.command(mediumCommands);

import revueCommands from '../commands/revue.js';
prettyCLI.command(revueCommands);

import squarespaceCommands from '../commands/squarespace.js';
prettyCLI.command(squarespaceCommands);

import substackMembersCommands from '../commands/substack-members.js';
prettyCLI.command(substackMembersCommands);

import substackCommands from '../commands/substack.js';
prettyCLI.command(substackCommands);

import wpApiCommands from '../commands/wp-api.js';
prettyCLI.command(wpApiCommands);

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
