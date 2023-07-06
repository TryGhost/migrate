import {exec as exexSyc, spawnSync} from 'child_process';
import ini from 'ini';
import util from 'util';
import {StripeAPI} from './StripeAPI.js';
import Logger from './Logger.js';
import select, { Separator } from '@inquirer/select';
import input from '@inquirer/input';

const exec = util.promisify(exexSyc);

class AvailableStripeAccount {
    id: string;
    mode: 'live' | 'test';
    name: string;
    apiKey: string;

    constructor(data: {name: string, apiKey: string, id: string, mode: 'live' | 'test'}) {
        this.name = data.name;
        this.apiKey = data.apiKey;
        this.id = data.id;
        this.mode = data.mode;
    }

    toString() {
        return this.name + ' (' + this.id + ')' + (this.mode === 'test' ? ' — Test mode' : '')
    }
}

export class StripeConnector {
    /**
     * Which mode to connect to when using the Stripe CLI
     */
    mode: 'live' | 'test' = 'test';

    async askForAccount(message: string) {
        // First list all connected accounts via Stripe CLI
        Logger.shared.startSpinner('Listing connected accounts...');
        const accounts = await this.getStripeCliConnectedAccounts();
        Logger.shared.stopSpinner();

        // Show a selectino list
        const account = await select<AvailableStripeAccount | null | 'cli'>({
            message,
            choices: [
                {
                    name: 'Enter API key manually',
                    value: null
                },
                {
                    name: 'Login with Stripe CLI',
                    value: 'cli' as const
                },
                ...accounts.map(account => ({
                    name: account.toString(),
                    value: account
                }))
            ]
        })

        let apiKey: string;

        if (account === null) {
            // Prompts
            apiKey = await input({
                message: 'Enter your Stripe API key',
            });
        } else if (account === 'cli') {
            // Prompts
            const account = await this.loginWithCli('ghost-migrate');
            apiKey = account.apiKey;
        } else {
            apiKey = account.apiKey;
        }

        const stripe = new StripeAPI({
            apiKey
        });

        return stripe;
    }

    /**
     * Try to get the api key via the Stripe CLI
     */
    async getStripeCliConnectedAccounts(): Promise<AvailableStripeAccount[]> {
        let output;
        try {
            output = await exec(`stripe config --list`);
        } catch (err) {
            console.error('Failed to fetch Stripe secret token, do you need to connect Stripe CLI?', err);
            return [];
        }

        // Parse .ini file output
        const parsed = ini.parse(output.stdout);
        const accounts: AvailableStripeAccount[] = []
        const searchKey = this.mode === 'live' ? 'live_mode_api_key' : 'test_mode_api_key';

        for (const scope of Object.values(parsed)) {
            if (!scope[searchKey] || !scope.display_name) {
                continue;
            }
            accounts.push(
                new AvailableStripeAccount({
                    name: scope.display_name,
                    apiKey: scope[searchKey],
                    id: scope.account_id,
                    mode: this.mode
                })
            )
        }
        return accounts
    }

    /**
     * Try to get the api key via the Stripe CLI
     */
    async loginWithCli(projectName = 'default'): Promise<AvailableStripeAccount> {
        let output;
        try {
            output = await spawnSync(`stripe login --project-name ${projectName}`, {
                encoding: 'utf-8',
                stdio: 'inherit',
                shell: true
            });
        } catch (err: any) {
            throw new Error('Failed to login with Stripe CLI: ' + err.message);
        }

        if (output.status !== 0) {
            throw new Error('Failed to login with Stripe CLI');
        }

        const account = await this.connectViaStripeCli(projectName);
        if (!account) {
            throw new Error('Failed to connect with Stripe CLI');
        }
        return account;
    }

    /**
     * Try to get the api key via the Stripe CLI
     */
    async connectViaStripeCli(projectName = 'default') {
        let output;
        try {
            projectName = 'migrate-to';
            output = await exec(`stripe config --list --project-name ${projectName}`);
        } catch (err) {
            console.error('Failed to fetch Stripe secret token, do you need to connect Stripe CLI?', err);
            return;
        }

        // Parse .ini file output
        const config = ini.parse(output.stdout);
        const searchKey = this.mode === 'live' ? 'live_mode_api_key' : 'test_mode_api_key';

        if (config[projectName] && config[projectName][searchKey]) {
            const scope = config[projectName];
            return new AvailableStripeAccount({
                name: scope.display_name,
                apiKey: scope[searchKey],
                id: scope.account_id,
                mode: this.mode
            })
        }
    }
}
