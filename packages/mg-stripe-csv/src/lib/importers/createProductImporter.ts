import Stripe from 'stripe';
import {Importer} from './Importer.js';
import {StripeAPI} from '../StripeAPI.js';
import {ImportStats} from './ImportStats.js';
import {getObjectId, ifDryRun, ifDryRunJustReturnFakeId} from '../helpers.js';

export function createProductImporter({oldStripe, newStripe, stats}: {
    dryRun: boolean,
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    stats: ImportStats
}) {
    const provider = {
        async getByID(oldId: string): Promise<Stripe.Product> {
            return oldStripe.client.products.retrieve(oldId);
        },

        getAll() {
            return oldStripe.client.products.list({limit: 100});
        },

        async findExisting(oldId: string) {
            const existing = await newStripe.client.products.search({
                query: `metadata['importOldId']:'${oldId}'`
            });
            if (existing.data.length > 0) {
                return existing.data[0];
            }
        },

        async recreate(oldProduct: Stripe.Product) {
            return await ifDryRunJustReturnFakeId(async () => {
                const product = await newStripe.client.products.create({
                    name: oldProduct.name,
                    description: oldProduct.description ?? undefined,
                    metadata: {
                        importOldId: oldProduct.id
                    }
                });
                return product.id;
            });
        },

        async revert(_: Stripe.Product, newProduct: Stripe.Product) {
            // Deleting product will also delete prices
            const prices = await newStripe.client.prices.list({
                product: getObjectId(newProduct),
                limit: 100
            });
            return await ifDryRun(async () => {
                for (const price of prices.data) {
                    await newStripe.client.prices.update(price.id, {
                        active: false
                    });
                }
                if (prices.data.length === 0) {
                    await newStripe.client.products.del(getObjectId(newProduct));
                } else {
                    await newStripe.client.products.update(getObjectId(newProduct), {
                        active: false
                    });
                }
            });
        }
    };

    return new Importer({
        objectName: 'product',
        stats,
        provider
    });
}
