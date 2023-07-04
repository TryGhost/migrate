import { parse } from 'csv-parse';
import fs from 'fs';
import {StripeAPI} from '../StripeAPI.js';
import DryRunIdGenerator from '../DryRunIdGenerator.js';
import CouponImporter from './CouponImporter.js';
import {ui} from '@tryghost/pretty-cli';

class SubscriptionCSVLine {
    id: string;
    coupon: string | null;

    constructor(data: any) {
        if (!data.id || typeof data.id !== 'string') {
            throw new Error('Missing or invalid id ' + JSON.stringify(data));
        }
        this.id = data.id;

        if (data.coupon && typeof data.coupon !== 'string') {
            throw new Error('Invalid coupon');
        }

        this.coupon = data.coupon ? data.coupon : null;
    }
}

/**
 * Context we need to have when importing a coupon, for error logging and data handling.
 */
type SubscriptionImportContext = {
    stripe: StripeAPI,
    dryRun: boolean
}

/**
 * The CouponImporter only imports on demand, this avoids the need to import all (unused) coupon data. The SubscriptionImporter will ask the CouponImporter to create a coupon if it doesn't exist yet.
 */
export default class SubscriptionImporter {
    filePath: string;
    couponImporter: CouponImporter;

    constructor(filePath: string, importers: {couponImporter: CouponImporter}) {
        this.filePath = filePath;
        this.couponImporter = importers.couponImporter;
    }

    async import(parsed: SubscriptionCSVLine, context: SubscriptionImportContext): Promise<string> {
        let newCouponId;

        if (parsed.coupon) {
            newCouponId = await this.couponImporter.importIfNeeded(parsed.coupon, context);
        }

        ui.log.info(`Importing subscription ${parsed.id}`);

        if (context.dryRun) {
            return DryRunIdGenerator.getNext();
        }

        throw new Error('Not implemented: cannot create subscription in Stripe yet');
    }

    /**
     * If ever needed, we could rewrite this to not read all lines at once to minimize memory usage.
     */
    async importAll(context: SubscriptionImportContext): Promise<void> {
        const errors: Error[] = [];

        // Initialize the parser
        return new Promise((resolve, reject) => {
            const parser = parse({
                columns: (header: string[]) => {
                    return header.map((column: string) => column.toLowerCase())
                }
            });
            const fileStream = fs.createReadStream(this.filePath);

            // Pipe fileStream through the parser
            fileStream.pipe(parser);

            (async () => {
                // Iterate through each records
                for await (const record of parser) {
                    try {
                        const parsed = new SubscriptionCSVLine(record);
                        await this.import(parsed, context)
                    } catch (e) {
                        errors.push(
                            new Error(`Invalid subscription in ${this.filePath} at line ${parser.info.records + 1}: ${e}`)
                        );
                    }
                }
                if (errors.length > 0) {
                    if (errors.length === 1) {
                        throw errors[0];
                    }
                    throw new Error(`Failed to import ${errors.length} subscriptions: \n\t${errors.join('\n\t')}`);
                }
            })().then(resolve).catch(reject);
        });
    }
}
