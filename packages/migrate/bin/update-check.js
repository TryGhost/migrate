import {join} from 'node:path';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import updateNotifier from 'update-notifier';
import chalk from 'chalk';

const __dirname = new URL('.', import.meta.url).pathname;

const packageJsonPath = join(__dirname, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath));

const notifier = updateNotifier({
    pkg: packageJson
});

const message = `Update available ${chalk.grey('{currentVersion}')} → ${chalk.green('{latestVersion}')}
Run ${chalk.cyan('npm i -g @tryghost/migrate')} to update.`;

notifier.notify({message});
