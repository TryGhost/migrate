import Stripe from "stripe"
import { Importer } from "./Importer.js"
import {StripeAPI} from "../StripeAPI.js"
import {ImportStats} from "./ImportStats.js";
import {ifDryRunJustReturnFakeId} from "../helpers.js";

export function createProductImporter({oldStripe, newStripe, stats}: {
    dryRun: boolean,
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    stats: ImportStats
}) {
    const provider = {
        async getByID(oldId: string): Promise<Stripe.Product> {
            return oldStripe.client.products.retrieve(oldId)
        },

        getAll()  {
            return oldStripe.client.products.list({limit: 100})
        },

        async findExisting(oldId: string) {
            const existing = await newStripe.client.products.search({
                query: `metadata['importOldId']:'${oldId}'`,
            })
            if (existing.data.length > 0) {
                return existing.data[0].id
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
                return product.id
            });
        }
    };

    return new Importer({
        objectName: 'product',
        stats,
        provider
    })
}
