import Stripe from 'stripe';
import Importer from './Importer.js';
import {StripeAPI} from '../StripeAPI.js';
import {ImportStats} from './ImportStats.js';
import {ifNotDryRun, ifDryRunJustReturnFakeId} from '../helpers.js';
import {ReuseLastCall} from '../ReuseLastCall.js';
import {Logger} from '../Logger.js';

export function createPriceImporter({oldStripe, newStripe, stats, productImporter}: {
    dryRun: boolean,
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    stats: ImportStats,
    productImporter: Importer<Stripe.Product>
}) {
    let cachedPrices: {[key: string]: Stripe.Price} | null = null;
    let reuse = new ReuseLastCall<void>();
    const provider = {
        async getByID(oldId: string): Promise<Stripe.Price> {
            return oldStripe.use(client => client.prices.retrieve(oldId, {expand: ['data.product']}));
        },

        getAll() {
            return oldStripe.useAsyncIterator(client => client.prices.list({limit: 100, expand: ['data.product']}));
        },

        async findExisting(oldItem: Stripe.Price) {
            // We guard this call, to avoid returning too soon while we are still fetching all the prices
            // The first one that gets here will start the fetching, and the rest will wait for it to finish
            // Then after that, it will always return immediately
            if (!cachedPrices) {
                await reuse.schedule('findExisting', async () => {
                    if (cachedPrices) {
                        return;
                    }
                    const _cachedPrices: {[key: string]: Stripe.Price} = {};

                    for await (const price of newStripe.useAsyncIterator(client => client.prices.list({
                        limit: 100,
                        active: true
                    }))
                    ) {
                        if (price.metadata.ghost_migrate_id) {
                            _cachedPrices[price.metadata.ghost_migrate_id] = price;
                        }
                    }
                    cachedPrices = _cachedPrices;
                });

                if (!cachedPrices) {
                    throw new Error('cachedPrices should be set');
                }
            }

            return cachedPrices[oldItem.id];
        },

        async recreate(oldPrice: Stripe.Price) {
            const newProductId = await productImporter.recreateByObjectOrId(oldPrice.product as Stripe.Product | string);

            return await ifDryRunJustReturnFakeId(async () => {
                const price = await newStripe.use(client => client.prices.create({
                    product: newProductId,
                    currency: oldPrice.currency,
                    unit_amount: oldPrice.unit_amount ?? undefined,
                    recurring: oldPrice.recurring ? {
                        interval: oldPrice.recurring.interval,
                        interval_count: oldPrice.recurring.interval_count ?? undefined,
                        trial_period_days: oldPrice.recurring.trial_period_days ?? undefined
                    } : undefined,
                    metadata: {
                        ghost_migrate_id: oldPrice.id
                    }
                }));
                return price.id;
            });
        },

        async revert(oldPrice: Stripe.Price, newPrice: Stripe.Price) {
            await newStripe.use(client => client.prices.update(newPrice.id, {
                active: false
            }));

            // Deleting product will also delete price
            await productImporter.revertByObjectOrId(oldPrice.product as Stripe.Product | string);
        }
    };

    return new Importer({
        objectName: 'price',
        stats,
        provider
    });
}
