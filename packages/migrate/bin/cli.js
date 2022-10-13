#!/usr/bin/env node
import prettyCLI from '@tryghost/pretty-cli';

import cacheCommands from '../commands/cache.js';
import curatedMembersCommands from '../commands/curated-members.js';
import curatedCommands from '../commands/curated.js';
import ghostCommands from '../commands/ghost.js';
import hubspotCommands from '../commands/hubspot.js';
import jekyllCommands from '../commands/jekyll.js';
import jsonEmailCommands from '../commands/json/email.js';
import jsonHtmlCardCommands from '../commands/json/html-card.js';
import jsonHtmlCommands from '../commands/json/html.js';
import jsonSlugifyCommands from '../commands/json/slugify.js';
import jsonCommands from '../commands/json.js';
import mediumCommands from '../commands/medium.js';
import revueCommands from '../commands/revue.js';
import squarespaceCommands from '../commands/squarespace.js';
import substackMembersCommands from '../commands/substack-members.js';
import substackCommands from '../commands/substack.js';
import wpApiCommands from '../commands/wp-api.js';

prettyCLI.preface('Command line utilities for migrating content to Ghost.');

prettyCLI.command(cacheCommands);
prettyCLI.command(curatedMembersCommands);
prettyCLI.command(curatedCommands);
prettyCLI.command(ghostCommands);
prettyCLI.command(hubspotCommands);
prettyCLI.command(jekyllCommands);
prettyCLI.command(jsonEmailCommands);
prettyCLI.command(jsonHtmlCardCommands);
prettyCLI.command(jsonHtmlCommands);
prettyCLI.command(jsonSlugifyCommands);
prettyCLI.command(jsonCommands);
prettyCLI.command(mediumCommands);
prettyCLI.command(revueCommands);
prettyCLI.command(squarespaceCommands);
prettyCLI.command(substackMembersCommands);
prettyCLI.command(substackCommands);
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
