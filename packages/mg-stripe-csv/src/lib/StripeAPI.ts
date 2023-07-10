import {Stripe} from 'stripe';

export class StripeAPI {
    client: Stripe;
    mode: 'live' | 'test';
    id!: string;

    constructor({apiKey}: {apiKey: string}) {
        this.client = new Stripe(apiKey, {
            apiVersion: '2022-11-15'
        });
        this.mode = apiKey.includes('_test_') ? 'test' : 'live';
    }

    async validate() {
        try {
            const account = await this.client.accounts.retrieve();
            //ui.log.ok(`Connected to Stripe account: ${account.settings?.dashboard.display_name} - ${this.mode} mode`);

            this.id = account.id;

            return {
                accountName: account.settings?.dashboard.display_name ?? 'Unknown',
                mode: this.mode
            };
        } catch (err) {
            throw new Error('Failed to connect to Stripe API, please check your API key');
        }
    }
}
