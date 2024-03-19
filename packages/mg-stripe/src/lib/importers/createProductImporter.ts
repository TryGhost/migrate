import Stripe from 'stripe';
import Importer, {createNoopImporter} from './Importer.js';
import {StripeAPI} from '../StripeAPI.js';
import {getObjectId, ifNotDryRun, ifDryRunJustReturnFakeId} from '../helpers.js';
import {ReuseLastCall} from '../ReuseLastCall.js';
import {Reporter} from './Reporter.js';

export function createProductImporter({oldStripe, newStripe, reporter}: {
    dryRun: boolean,
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    reporter: Reporter
}) {
    if (oldStripe.equals(newStripe)) {
        return createNoopImporter();
    }

    let cachedProducts: {[key: string]: Stripe.Product} | null = null;
    let reuse = new ReuseLastCall<void>();

    const provider = {
        async getByID(oldId: string): Promise<Stripe.Product> {
            return oldStripe.use(client => client.products.retrieve(oldId));
        },

        getAll() {
            return oldStripe.useAsyncIterator(client => client.products.list({limit: 100}));
        },

        async findExisting(oldItem: Stripe.Product) {
            // We guard this call, to avoid returning too soon while we are still fetching all the prices
            // The first one that gets here will start the fetching, and the rest will wait for it to finish
            // Then after that, it will always return immediately
            if (!cachedProducts) {
                await reuse.schedule('findExisting', async () => {
                    if (cachedProducts) {
                        return;
                    }
                    const _cachedProducts: {[key: string]: Stripe.Product} = {};

                    for await (const product of newStripe.useAsyncIterator(client => client.products.list({
                        limit: 100,
                        active: true
                    }))) {
                        if (product.metadata.ghost_migrate_id) {
                            _cachedProducts[product.metadata.ghost_migrate_id] = product;
                        }
                    }
                    cachedProducts = _cachedProducts;
                });

                if (!cachedProducts) {
                    throw new Error('cachedProducts should be set');
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
        objectName: 'Product',
        provider,
        reporter
    });
}
