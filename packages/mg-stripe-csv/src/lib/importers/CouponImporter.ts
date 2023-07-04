import { parse } from 'csv-parse';
import fs from 'fs';
import {StripeAPI} from '../StripeAPI.js';
import DryRunIdGenerator from '../DryRunIdGenerator.js';
import {ui} from '@tryghost/pretty-cli';

class CouponCSVLine {
    id: string;

    constructor(data: any) {
        if (!data.id || typeof data.id !== 'string') {
            throw new Error('Missing or invalid id');
        }
        this.id = data.id;
    }
}

/**
 * Context we need to have when importing a coupon, for error logging and data handling.
 */
type CouponImportContext = {
    stripe: StripeAPI,
    dryRun: boolean
}

/**
 * The CouponImporter only imports on demand, this avoids the need to import all (unused) coupon data. The SubscriptionImporter will ask the CouponImporter to create a coupon if it doesn't exist yet.
 */
export default class CouponImporter {
    filePath: string;
    didReadAll: boolean = false;

    /**
     * This map keeps track of all the imported coupons, and maps the old coupon id to the new coupon id.
     */
    importedCoupons: Map<string, string> = new Map();

    /**
     * Data read from the CSV file that is not yet used. Mapped by the old coupon id.
     */
    couponCache: Map<string, CouponCSVLine> = new Map();

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    didImport(oldCouponId: string): boolean {
        return this.importedCoupons.has(oldCouponId);
    }

    async importIfNeeded(oldCouponId: string, context: CouponImportContext): Promise<string> {
        if (this.didImport(oldCouponId)) {
            return this.importedCoupons.get(oldCouponId)!;
        }

        const id = await this.import(oldCouponId, context);
        this.importedCoupons.set(oldCouponId, id);
        return id;
    }

    private async import(oldCouponId: string, context: CouponImportContext): Promise<string> {
        await this.readAllIfNeeded();
        const line = this.couponCache.get(oldCouponId);
        if (line === undefined) {
            throw new Error(`Coupon with ID ${oldCouponId} does not exist`);
        }

        ui.log.info(`Importing coupon ${oldCouponId}`);

        if (context.dryRun) {
            return DryRunIdGenerator.getNext();
        }

        throw new Error('Not implemented: cannot create coupon in Stripe yet');
    }

    assertInitialized(): void {
        if (!this.didReadAll) {
            throw new Error('CouponImporter not initialized');
        }
    }

    async readAllIfNeeded(): Promise<void> {
        if (this.didReadAll) {
            return Promise.resolve();
        }
        return await this.readAll();
    }

    /**
     * If ever needed, we could rewrite this to not read all lines at once to minimize memory usage.
     */
    async readAll(): Promise<void> {
        if (this.didReadAll) {
            return Promise.resolve();
        }
        this.didReadAll = true;

        // Initialize the parser
        return new Promise((resolve, reject) => {
            const parser = parse({
                columns: (header: string[]) => {
                    return header.map((column: string) => column.toLowerCase())
                }
            });
            const fileStream = fs.createReadStream(this.filePath);
            fileStream.pipe(parser);

            (async () => {
                // Iterate through each records
                for await (const record of parser) {
                    try {
                        const parsed = new CouponCSVLine(record);
                        this.couponCache.set(parsed.id, parsed);
                    } catch (e) {
                        throw new Error(`Invalid coupon in row ${parser.info.records}: ${e}`);
                    }
                }
            })().then(resolve).catch(reject);
        });
    }
}
