import {readFileSync} from 'node:fs';
import updateNotifier from 'update-notifier';
import chalk from 'chalk';
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

const notifier = updateNotifier({
    pkg: packageJson
});

const message = `Update available ${chalk.grey('{currentVersion}')} → ${chalk.green('{latestVersion}')}
Run ${chalk.cyan('npm i -g @tryghost/migrate')} to update.`;

notifier.notify({message});
