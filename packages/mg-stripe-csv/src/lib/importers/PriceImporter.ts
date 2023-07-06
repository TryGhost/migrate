import DryRunIdGenerator from '../DryRunIdGenerator.js';
import {Data} from '../decoders/Data.js';
import Logger from '../Logger.js';
import {ImportContext, LineData, OnDemandImporter} from './OnDemandImporter.js';

class CSVLine {
    id: string;
    productId: string;
    productName: string;
    description: string;
    amount: number;
    currency: string;
    interval: 'year' | 'month';

    constructor(data: Data) {
        this.id = data.field('price id').string;
        this.productId = data.field('product id').string;
        this.productName = data.field('product name').string;
        this.description = data.field('description').string;
        this.amount = data.field('amount').integer;
        this.currency = data.field('currency').string;
        this.interval = data.field('interval').enum(['year', 'month']);
    }

    static decode(data: Data): CSVLine {
        return new CSVLine(data);
    }
}

async function importLine(line: CSVLine, context: ImportContext): Promise<string> {
    // Importing should try to be idempotent, so first search if we already imported this subscription in this account.
    // We can do this because we store the old id in the metadata importOldId field
    const existingPrice = await context.stripe.client.prices.search({
        limit: 1,
        query: `metadata['importOldId']:'${line.id}'`
    })

    if (existingPrice.data.length > 0) {
        Logger.shared.info(`Reusing existing price ${existingPrice.data[0].id} for ${line.id}`);
        context.stats.trackReused('price');
        return existingPrice.data[0].id;
    }

    // Search or create the product
    const existingProduct = await context.stripe.client.products.search({
        limit: 1,
        query: `metadata['importOldId']:'${line.productId}'`
    })
    let newProductId: string;

    if (!existingProduct.data.length) {
        Logger.shared.info(`Creating product ${line.productName}`);

        if (context.dryRun) {
            newProductId = DryRunIdGenerator.getNext();
        } else {
            const product = await context.stripe.client.products.create({
                name: line.productName,
                description: line.description,
                metadata: {
                    importOldId: line.productId
                }
            });
            newProductId = product.id;
        }
        context.stats.trackImported('product');
        Logger.shared.ok(`Created product ${newProductId} for ${line.productId}`);
    } else {
        Logger.shared.info(`Reusing existing product ${existingProduct.data[0].id} for ${line.productId}`);
        newProductId = existingProduct.data[0].id;
        context.stats.trackReused('product');
    }

    // Create the price
    Logger.shared.info(`Creating price ${line.id}`);

    if (context.dryRun) {
        const newPriceId = DryRunIdGenerator.getNext();
        Logger.shared.ok(`Created price ${newPriceId} for ${line.id}`);
        context.stats.trackImported('price');
        return newPriceId;
    }

    const price = await context.stripe.client.prices.create({
        product: newProductId,
        currency: line.currency,
        unit_amount: line.amount,
        recurring: {
            interval: line.interval
        },
        metadata: {
            importOldId: line.id
        }
    });
    context.stats.trackImported('price');
    Logger.shared.ok(`Created price ${price.id} for ${line.id}`);

    return price.id;
}

export const getPriceImporter = (filePath: string) => {
    return new OnDemandImporter({
        itemName: 'price',
        filePath,
        decoder: CSVLine,
        importLine
    });
};
