import Stripe from 'stripe';
import {Importer} from './Importer.js';
import {StripeAPI} from '../StripeAPI.js';
import {ImportStats} from './ImportStats.js';
import {getObjectId, ifNotDryRun, ifDryRunJustReturnFakeId} from '../helpers.js';

export function createProductImporter({oldStripe, newStripe, stats}: {
    dryRun: boolean,
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    stats: ImportStats
}) {
    let cachedProducts: {[key: string]: Stripe.Product} | null = null;
    const provider = {
        async getByID(oldId: string): Promise<Stripe.Product> {
            return oldStripe.use(client => client.products.retrieve(oldId));
        },

        getAll() {
            return oldStripe.useAsyncIterator(client => client.products.list({limit: 100}));
        },

        async findExisting(oldItem: Stripe.Product) {
            if (cachedProducts) {
                return cachedProducts[oldItem.id];
            }
            cachedProducts = {};

            for await (const product of newStripe.useAsyncIterator(client => client.products.list({
                limit: 100,
                active: true
            }))) {
                if (product.metadata.ghost_migrate_id) {
                    cachedProducts[product.metadata.ghost_migrate_id] = product;
                }
            }

            return cachedProducts[oldItem.id];
        },

        async recreate(oldProduct: Stripe.Product) {
            return await ifDryRunJustReturnFakeId(async () => {
                const product = await newStripe.use(client => client.products.create({
                    name: oldProduct.name,
                    description: oldProduct.description ?? undefined,
                    metadata: {
                        ghost_migrate_id: oldProduct.id
                    }
                }));
                return product.id;
            });
        },

        async revert(_: Stripe.Product, newProduct: Stripe.Product) {
            // Deleting product will also delete prices
            const prices = await newStripe.use(client => client.prices.list({
                product: getObjectId(newProduct),
                limit: 100
            }));
            return await ifNotDryRun(async () => {
                for (const price of prices.data) {
                    if (price.active) {
                        await newStripe.use(client => client.prices.update(price.id, {
                            active: false
                        }));
                        stats.trackReverted('price');
                    }
                }
                if (prices.data.length === 0) {
                    await newStripe.use(client => client.products.del(getObjectId(newProduct)));
                } else {
                    await newStripe.use(client => client.products.update(getObjectId(newProduct), {
                        active: false
                    }));
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
