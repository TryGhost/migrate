import {Stripe} from 'stripe';
import {Queue} from './Queue.js';

export class StripeAPI {
    mode: 'live' | 'test';
    id!: string;
    #maxRequestsPerSecond: number;
    #client: Stripe;
    #queue: Queue;

    get debugClient() {
        return this.#client;
    }

    constructor({apiKey}: {apiKey: string}) {
        this.#client = new Stripe(apiKey, {
            apiVersion: '2022-11-15'
        });
        this.mode = apiKey.includes('_test_') ? 'test' : 'live';
        this.#maxRequestsPerSecond = this.mode === 'test' ? 20 : 90;
        this.#queue = new Queue({
            maxRunningTasks: this.#maxRequestsPerSecond
        });
    }

    async validate() {
        try {
            const account = await this.use(client => client.accounts.retrieve());
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

    /**
     * Use the Stripe client in a rate-limited context.
     */
    async use<T>(task: (client: Stripe) => Promise<T>): Promise<T> {
        return this.#queue.addAndWait(async () => {
            const result = await task(this.#client);
            return result;
        }, 1000);
    }

    useAsyncIterator<T>(task: (client: Stripe) => {[Symbol.asyncIterator](): AsyncIterator<T>}): {[Symbol.asyncIterator](): AsyncIterator<T>} {
        const iterator = task(this.#client)[Symbol.asyncIterator]();
        let i = 0;
        return {
            [Symbol.asyncIterator]() {
                return {
                    async next() {
                        i += 1;

                        if (i % 100 === 0) {
                            // Sleep one second
                            await new Promise((resolve) => {
                                setTimeout(resolve, 1000);
                            });
                        }
                        return await iterator.next();
                    }
                };
            }
        };
    }
}
