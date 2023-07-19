import Stripe from 'stripe';
import {Importer} from './Importer.js';
import {StripeAPI} from '../StripeAPI.js';
import {ImportStats} from './ImportStats.js';
import {ifNotDryRun, ifDryRunJustReturnFakeId} from '../helpers.js';

export function createPriceImporter({oldStripe, newStripe, stats, productImporter}: {
    dryRun: boolean,
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    stats: ImportStats,
    productImporter: Importer<Stripe.Product>
}) {
    let cachedPrices: {[key: string]: Stripe.Price} | null = null;
    const provider = {
        async getByID(oldId: string): Promise<Stripe.Price> {
            return oldStripe.client.prices.retrieve(oldId, {expand: ['data.product']});
        },

        getAll() {
            return oldStripe.client.prices.list({limit: 100, expand: ['data.product']});
        },

        async findExisting(oldItem: Stripe.Price) {
            if (cachedPrices) {
                return cachedPrices[oldItem.id];
            }
            cachedPrices = {};

            for await (const price of newStripe.client.prices.list({
                limit: 100,
                active: true
            })) {
                if (price.metadata.ghost_migrate_id) {
                    cachedPrices[price.metadata.ghost_migrate_id] = price;
                }
            }

            return cachedPrices[oldItem.id];
        },

        async recreate(oldPrice: Stripe.Price) {
            const newProductId = await productImporter.recreateByObjectOrId(oldPrice.product as Stripe.Product | string);

            return await ifDryRunJustReturnFakeId(async () => {
                const price = await newStripe.client.prices.create({
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
                });
                return price.id;
            });
        },

        async revert(oldPrice: Stripe.Price, newPrice: Stripe.Price) {
            await newStripe.client.prices.update(newPrice.id, {
                active: false
            });

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
