import {Data} from '../decoders/Data.js';
import {ImportContext, OnDemandImporter} from './OnDemandImporter.js';
import {FullImporter} from './FullImporter.js';
import DryRunIdGenerator from '../DryRunIdGenerator.js';
import {dateToUnix} from '../helpers.js';
import Logger from '../Logger.js';
import {ImportError} from './ImportError.js';

class CSVLine {
    id: string;
    customerId: string;
    coupon: string | null;
    priceId: string;
    status: string;
    trialEnd: Date | null;
    currentPeriodEnd: Date;

    constructor(data: Data) {
        this.id = data.field('id').string;
        this.customerId = data.field('customer id').string;
        this.coupon = data.optionalField('coupon')?.nullable?.string ?? null;
        this.priceId = data.field('plan').string;
        this.status = data.field('status').string;
        this.trialEnd = data.field('trial end (utc)')?.nullable?.date ?? null;
        this.currentPeriodEnd = data.field('current period end (utc)').date;
    }

    static decode(data: Data): CSVLine {
        return new CSVLine(data);
    }
}

export const getSubscriptionImporter = ({filePath, importers}: {
    filePath: string,
    importers: {
        coupons: OnDemandImporter,
        prices: OnDemandImporter
    }
}) => {
    async function importLine(line: CSVLine, context: ImportContext): Promise<string> {
        if (line.status === 'canceled') {
            Logger.shared.info(`Skipping canceled subscription ${line.id}`);
            return '';
        }

        let newCouponId: string | null = null;
        if (line.coupon) {
            newCouponId = await importers.coupons.importIfNeeded(line.coupon, context);
        }

        const newPriceId = await importers.prices.importIfNeeded(line.priceId, context);

        // Importing should try to be idempotent, so first search if we already imported this subscription in this account.
        // We can do this because we store the old id in the metadata importOldId field
        const existingSubscription = await context.stripe.client.subscriptions.search({
            limit: 1,
            query: `metadata['importOldId']:'${line.id}'`
        })

        if (existingSubscription.data.length > 0) {
            Logger.shared.info(`Reusing existing subscription ${existingSubscription.data[0].id} for ${line.id}`);
            context.stats.trackReused('subscription');
            return existingSubscription.data[0].id;
        }

        // Check if the customer exists (for proper error handling, we could move this to the dry run if it is too slow)
        const customer = await context.stripe.client.customers.retrieve(line.customerId);
        if (customer.deleted) {
            throw new Error(`Customer ${line.customerId} has been permanently deleted and cannot be used for a new subscription`)
        }

        if (context.dryRun) {
            const newSubscriptionId = DryRunIdGenerator.getNext();
            Logger.shared.ok(`Created subscription ${newSubscriptionId} for ${line.id}`);
            context.stats.trackImported('subscription');
            return newSubscriptionId;
        }

        // Create the subscription
        const subscription = await context.stripe.client.subscriptions.create({
            customer: line.customerId,
            items: [
                {
                    price: newPriceId
                }
            ],
            billing_cycle_anchor: dateToUnix(line.currentPeriodEnd),
            cancel_at_period_end: false,
            coupon: newCouponId ?? undefined,
            trial_end: dateToUnix(line.trialEnd),
            metadata: {
                importOldId: line.id
            }
        });
        Logger.shared.ok(`Created subscription ${subscription.id} for ${line.id}`);
        context.stats.trackImported('subscription');
        return subscription.id;
    }


    return new FullImporter({
        itemName: 'subscription',
        filePath,
        decoder: CSVLine,
        importLine
    });
};
