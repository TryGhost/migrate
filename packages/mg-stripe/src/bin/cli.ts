import {Api, styles} from '@tryghost/pretty-cli';
import command from '../lib/command.js';

const prettyCLI = Api.get()
    .style(styles)
    .epilogue(' ')
    .showHelpByDefault();

prettyCLI.command(command);
prettyCLI.parseAndExit();
