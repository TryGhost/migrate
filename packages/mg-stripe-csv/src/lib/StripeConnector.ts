import input from '@inquirer/input';
import select from '@inquirer/select';
import {exec as exexSyc} from 'child_process';
import util from 'util';
import Logger from './Logger.js';
import {StripeAPI} from './StripeAPI.js';

const exec = util.promisify(exexSyc);

export class StripeConnector {
    /**
     * Which mode to connect to when using the Stripe CLI
     */
    mode: 'live' | 'test' = 'test';

    constructor(mode: 'live' | 'test' = 'test') {
        this.mode = mode;
    }

    async askForAccount(message: string, tryApiKey?: string): Promise<StripeAPI> {
        if (tryApiKey) {
            const stripe = new StripeAPI({
                apiKey: tryApiKey
            });
            return stripe;
        }

        // Show a selectino list
        const account = await select<'enter' | 'open'>({
            message,
            choices: [
                {
                    name: 'Enter API key manually',
                    value: 'enter'
                },
                {
                    name: 'Open Stripe dashboard to create new API key',
                    value: 'open'
                }
            ]
        });

        let apiKey: string;

        if (account === 'enter') {
            // Prompts
            apiKey = await input({
                message: 'Enter your Stripe API key'
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
