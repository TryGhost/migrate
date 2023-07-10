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
    namespace?: string;

    constructor(data: {name: string, apiKey: string, id: string, mode: 'live' | 'test', namespace?: string}) {
        this.name = data.name;
        this.apiKey = data.apiKey;
        this.id = data.id;
        this.mode = data.mode;
        this.namespace = data.namespace;
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

    constructor(mode: 'live' | 'test' = 'test') {
        this.mode = mode;
    }

    async askForAccount(message: string, tryApiKey?: string, excludeIds: string[] = []): Promise<StripeAPI> {
        if (tryApiKey) {
            const stripe = new StripeAPI({
                apiKey: tryApiKey
            });
            return stripe;
        }

        // First list all connected accounts via Stripe CLI
        Logger.shared.startSpinner('Listing connected accounts...');
        const accounts = await this.getStripeCliConnectedAccounts();
        Logger.shared.stopSpinner();

        const filteredAccounts = accounts.filter(account => !excludeIds.includes(account.id));

        // Show a selectino list
        const account = await select<AvailableStripeAccount | null | 'cli' | 'clear'>({
            message,
            choices: [
                ...filteredAccounts.map(account => ({
                    name: account.toString(),
                    value: account
                })),
                ...(filteredAccounts.length > 0 ? [
                    new Separator()
                ] : []),
                {
                    name: 'Enter API key manually',
                    value: null
                },
                {
                    name: 'Login with Stripe CLI',
                    value: 'cli' as const
                },
                ...(filteredAccounts.length > 0 ? [
                    {
                        name: 'Clear saved accounts',
                        value: 'clear' as const,
                        description: 'Clears the saved accounts from the Stripe CLI'
                    }
                ] : []),
            ]
        })

        let apiKey: string;

        if (account === null) {
            // Prompts
            apiKey = await input({
                message: 'Enter your Stripe API key',
            });
        } else if (account === 'clear') {
            Logger.shared.startSpinner('Clearing accounts...');
            for (const account of accounts) {
                if (account.namespace && account.namespace.startsWith('ghost-migrate-')) {
                    await this.logout(account.namespace)
                }
            }
            Logger.shared.stopSpinner();
            return this.askForAccount(message);
        } else if (account === 'cli') {
            // Prompts
            const account = await this.loginWithCli('ghost-migrate-' + (accounts.length + 1));
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

        for (const projectName of Object.keys(parsed)) {
            const scope = parsed[projectName];
            if (!scope[searchKey] || !scope.display_name) {
                continue;
            }
            accounts.push(
                new AvailableStripeAccount({
                    name: scope.display_name,
                    apiKey: scope[searchKey],
                    id: scope.account_id,
                    mode: this.mode,
                    namespace: projectName
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
    async logout(projectName = 'default'): Promise<void> {
        let output;
        try {
            output = await exec(`stripe logout --project-name ${projectName}`);
        } catch (err: any) {
            throw new Error('Failed to logout with Stripe CLI: ' + err.message);
        }
    }

    /**
     * Try to get the api key via the Stripe CLI
     */
    async connectViaStripeCli(projectName = 'default') {
        let output;
        try {
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
