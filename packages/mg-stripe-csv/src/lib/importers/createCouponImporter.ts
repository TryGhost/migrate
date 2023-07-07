import Stripe from "stripe"
import { Importer } from "./Importer.js"
import {StripeAPI} from "../StripeAPI.js"
import {ImportStats} from "./ImportStats.js";
import Logger from "../Logger.js";
import {ifDryRunJustReturnFakeId} from "../helpers.js";

export function createCouponImporter({oldStripe, newStripe, stats}: {
    dryRun: boolean,
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    stats: ImportStats
}) {
    const provider = {
        async getByID(oldId: string): Promise<Stripe.Coupon> {
            return oldStripe.client.coupons.retrieve(oldId)
        },

        getAll()  {
            return oldStripe.client.coupons.list({limit: 100})
        },

        async findExisting(oldId: string) {
            try {
                const existing = await newStripe.client.coupons.retrieve(oldId)
                return existing.id
            } catch (e: any) {
                Logger.v?.info(`Coupon ${oldId} not found in new Stripe: ${e.message}`)
                return
            }
        },

        async recreate(oldCoupon: Stripe.Coupon) {
            return await ifDryRunJustReturnFakeId(async () => {
                const coupon = await newStripe.client.coupons.create({
                    id: oldCoupon.id,
                    name: oldCoupon.name ?? undefined,
                    amount_off: oldCoupon.amount_off ?? undefined,
                    percent_off: oldCoupon.percent_off ?? undefined,
                    currency: oldCoupon.currency ?? undefined,
                    duration: oldCoupon.duration ?? undefined,
                    duration_in_months: oldCoupon.duration_in_months ?? undefined,
                    metadata: oldCoupon.metadata ?? undefined,
                    max_redemptions: oldCoupon.max_redemptions!== null ? (oldCoupon.max_redemptions - oldCoupon.times_redeemed) : undefined,
                    redeem_by: oldCoupon.redeem_by ?? undefined,
                    currency_options: oldCoupon.currency_options ?? undefined,
                    applies_to: oldCoupon.applies_to ?? undefined,
                });
                return coupon.id
            });
        }
    };

    return new Importer({
        objectName: 'coupon',
        stats,
        provider
    })
}
