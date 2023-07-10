import Stripe from 'stripe';
import {Importer} from './Importer.js';
import {StripeAPI} from '../StripeAPI.js';
import {ImportStats} from './ImportStats.js';
import {ifDryRunJustReturnFakeId} from '../helpers.js';

export function createPriceImporter({oldStripe, newStripe, stats, productImporter}: {
    dryRun: boolean,
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    stats: ImportStats,
    productImporter: Importer<Stripe.Product>
}) {
    const provider = {
        async getByID(oldId: string): Promise<Stripe.Price> {
            return oldStripe.client.prices.retrieve(oldId, {expand: ['data.product']});
        },

        getAll() {
            return oldStripe.client.prices.list({limit: 100, expand: ['data.product']});
        },

        async findExisting(oldId: string) {
            const existing = await newStripe.client.prices.search({
                query: `metadata['importOldId']:'${oldId}'`
            });
            if (existing.data.length > 0) {
                return existing.data[0].id;
            }
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
                        importOldId: oldPrice.id
                    }
                });
                return price.id;
            });
        }
    };

    return new Importer({
        objectName: 'price',
        stats,
        provider
    });
}
