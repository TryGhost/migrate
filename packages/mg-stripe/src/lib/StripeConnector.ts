import input from '@inquirer/input';
import select from '@inquirer/select';
import chalk from 'chalk';
import {exec as exexSyc} from 'child_process';
import util from 'util';
import {Logger} from './Logger.js';
import {Options} from './Options.js';
import {StripeAPI} from './StripeAPI.js';

const exec = util.promisify(exexSyc);

export class StripeConnector {
    async askAccounts(options: Options) {
        const fromAccount = await this.askForAccount('From Stripe account?', options.oldApiKey);

        Logger.shared.startSpinner('Validating API-key');
        const {accountName, mode} = await fromAccount.validate();
        Logger.shared.succeed(`From ${chalk.green(accountName)} (${mode} mode)`);

        const toAccount = await this.askForAccount('To which Stripe account?', options.newApiKey, fromAccount);

        if (toAccount === fromAccount) {
            Logger.shared.succeed('Within same account (removing platform fees)\n');
        } else {
            Logger.shared.startSpinner('Validating API-key');
            const {accountName: accountNameTo, mode: modeTo} = await toAccount.validate();
            Logger.shared.succeed(`To ${chalk.green(accountNameTo)} (${modeTo} mode)\n`);
        }

        return {fromAccount, toAccount};
    }

    async askForAccount(message: string, tryApiKey?: string, same?: StripeAPI): Promise<StripeAPI> {
        if (tryApiKey) {
            if (same && same.hasSameKey(tryApiKey)) {
                return same;
            }

            const stripe = new StripeAPI({
                apiKey: tryApiKey
            });
            return stripe;
        }

        // Show a selection list
        const account = await select<'enter' | 'open' | 'same'>({
            message,
            choices: [
                ...(same ? [
                    {
                        name: 'Within the same account (' + same.name! + ' / ' + same.id! + ')',
                        value: 'same' as 'same'
                    }
                ] : []),
                {
                    name: 'Enter Stripe API secret key',
                    value: 'enter'
                },
                {
                    name: 'Open Stripe dashboard to get a Stripe API secret key',
                    value: 'open'
                }
            ]
        });

        let apiKey: string;

        if (account === 'same') {
            return same!;
        }

        if (account === 'enter') {
            // Prompts
            apiKey = await input({
                message: 'Enter your Stripe API secret key:'
            });
        } else {
            const url = 'https://dashboard.stripe.com/apikeys';
            Logger.shared.info('Opening ' + url + ' in your browser...');
            await exec(`open ${url}`);
            return this.askForAccount(message);
        }

        const stripe = new StripeAPI({
            apiKey
        });

        return stripe;
    }
}
