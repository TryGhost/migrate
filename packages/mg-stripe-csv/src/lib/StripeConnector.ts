import util from 'util';
import {exec as exexSyc} from 'child_process';
import {ui} from '@tryghost/pretty-cli';
import {StripeAPI} from './StripeAPI.js';
const exec = util.promisify(exexSyc);

export class StripeConnector {
    /**
     * Which mode to connect to when using the Stripe CLI
     */
    mode: 'live' | 'test' = 'test';

    async connect() {
        const connected = await this.connectViaStripeCli();
        if (connected) {
            ui.log.info(`Using ${this.mode} api key from Stripe CLI (stripe login)`);
            StripeAPI.shared = connected;
            return;
        }

        throw new Error('Failed to connect to Stripe API. Please login with the Stripe CLI via `stripe login`');
    }

    /**
     * Try to get the api key via the Stripe CLI
     */
    async connectViaStripeCli() {
        let output;
        try {
            output = await exec('stripe config --list --project-name default');
        } catch (err) {
            console.error('Failed to fetch Stripe secret token, do you need to connect Stripe CLI?', err);
            return;
        }

        // Parse .ini file output
        const lines = output.stdout.split('\n');
        const config: Record<string, string> = lines.reduce((acc, line) => {
            const [key, value] = line.split('=');

            if (key && value) {
                acc[key.trim()] = JSON.parse(value.trim())
            }
            return acc;
        }, {} as Record<string, string>);

        const searchKey = this.mode === 'live' ? 'live_mode_api_key' : 'test_mode_api_key';

        if (config[searchKey]) {
            return new StripeAPI({
                apiKey: config[searchKey]
            });
        }
    }
}
