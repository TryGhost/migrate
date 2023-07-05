import DryRunIdGenerator from '../DryRunIdGenerator.js';
import {Data} from '../decoders/Data.js';
import {ImportContext, OnDemandImporter} from './OnDemandImporter.js';

class CSVLine {
    id: string;
    duration: 'forever' | 'once' | 'repeating';
    durationInMonths: number | null;
    percentOff: number | null;
    amountOff: number | null;

    constructor(data: Data) {
        this.id = data.field('id').string;
        this.duration = data.field('duration').enum(['forever', 'once', 'repeating']);
        this.durationInMonths = data.field('duration in months').nullable?.integer ?? null;
        this.percentOff = data.field('percent off').nullable?.float ?? null;
        this.amountOff = data.field('amount off').nullable?.integer ?? null;
    }

    static decode(data: Data): CSVLine {
        return new CSVLine(data);
    }
}

async function importLine(line: CSVLine, context: ImportContext): Promise<string> {
    // Importing should try to be idempotent, so first search if we already imported this subscription in this account.
    // We can do this because we store the old id in the metadata importOldId field
    const existingCoupon = await context.stripe.client.coupons.retrieve(line.id);
    if (existingCoupon) {
        context.stats.trackReused('coupon');
        return existingCoupon.id;
    }

    if (context.dryRun) {
        context.stats.trackImported('coupon');
        return DryRunIdGenerator.getNext();
    }

    const coupon = await context.stripe.client.coupons.create({
        id: line.id,
        duration: line.duration,
        duration_in_months: line.durationInMonths ?? undefined,
        percent_off: line.percentOff ?? undefined,
        amount_off: line.amountOff ?? undefined
    });
    context.stats.trackImported('coupon');

    return coupon.id;
}

export const getCouponImporter = (filePath: string) => {
    return new OnDemandImporter({
        itemName: 'coupon',
        filePath,
        decoder: CSVLine,
        importLine
    });
};
