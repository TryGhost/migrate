#!/usr/bin/env node
import './update-check.js';

import {Api, styles} from '@tryghost/pretty-cli';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const __dirname = new URL('.', import.meta.url).pathname;
const packageJSON = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

import beehiivCommands from '../commands/beehiiv.js';
import beehiivMembersCommands from '../commands/beehiiv-members.js';
import bloggerCommands from '../commands/blogger.js';
import cacheCommands from '../commands/cache.js';
import chorusCommands from '../commands/chorus.js';
import curatedMembersCommands from '../commands/curated-members.js';
import curatedCommands from '../commands/curated.js';
import ghostCommands from '../commands/ghost.js';
import jekyllCommands from '../commands/jekyll.js';
import jsonEmailCommands from '../commands/json/email.js';
import jsonHtmlCardCommands from '../commands/json/html-card.js';
import jsonHtmlCommands from '../commands/json/html.js';
import jsonSlugifyCommands from '../commands/json/slugify.js';
import letterdropCommands from '../commands/letterdrop.js';
import libsynCommands from '../commands/libsyn.js';
import mediumCommands from '../commands/medium.js';
import squarespaceCommands from '../commands/squarespace.js';
import stripeCommands from '../commands/stripe.js';
import substackMembersCommands from '../commands/substack-members.js';
import substackCommands from '../commands/substack.js';
import tinynewsCommands from '../commands/tinynews.js';
import tinynewsMembersCommands from '../commands/tinynews-members.js';
import wpApiCommands from '../commands/wp-api.js';
import wpXMLCommands from '../commands/wp-xml.js';

const prettyCLI = Api.get()
    .help('-h, --help', {group: 'Global Options:'})
    .version('-v, --version', {
        group: 'Global Options:',
        version: packageJSON.version
    })
    .style(styles)
    .epilogue(' ')
    .showHelpByDefault();

prettyCLI.preface('Command line utilities for migrating content to Ghost.');

prettyCLI.command(beehiivCommands);
prettyCLI.command(beehiivMembersCommands);
prettyCLI.command(bloggerCommands);
prettyCLI.command(cacheCommands);
prettyCLI.command(chorusCommands);
prettyCLI.command(curatedMembersCommands);
prettyCLI.command(curatedCommands);
prettyCLI.command(ghostCommands);
prettyCLI.command(jekyllCommands);
prettyCLI.command(jsonEmailCommands);
prettyCLI.command(jsonHtmlCardCommands);
prettyCLI.command(jsonHtmlCommands);
prettyCLI.command(jsonSlugifyCommands);
prettyCLI.command(letterdropCommands);
prettyCLI.command(libsynCommands);
prettyCLI.command(mediumCommands);
prettyCLI.command(squarespaceCommands);
prettyCLI.command(stripeCommands);
prettyCLI.command(substackMembersCommands);
prettyCLI.command(substackCommands);
prettyCLI.command(tinynewsCommands);
prettyCLI.command(tinynewsMembersCommands);
prettyCLI.command(wpApiCommands);
prettyCLI.command(wpXMLCommands);

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
