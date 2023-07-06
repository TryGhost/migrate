import Stripe from "stripe"
import { Importer } from "./Importer.js"
import {StripeAPI} from "../StripeAPI.js"
import {ImportStats} from "./ImportStats.js";
import {dateToUnix, getObjectId} from "../helpers.js";

export function createSubscriptionImporter({oldStripe, newStripe, stats, priceImporter}: {
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    stats: ImportStats,
    priceImporter: Importer<Stripe.Price>
}) {
    const provider = {
        async getByID(oldId: string): Promise<Stripe.Subscription> {
            return oldStripe.client.subscriptions.retrieve(oldId, {expand: ['data.default_payment_method']})
        },

        getAll()  {
            return oldStripe.client.subscriptions.list({limit: 100, expand: ['data.default_payment_method']})
        },

        async findExisting(oldId: string) {
            const existing = await newStripe.client.subscriptions.search({
                query: `metadata['importOldId']:'${oldId}'`,
            })
            if (existing.data.length > 0) {
                return existing.data[0].id
            }
        },

        async recreate(oldSubscription: Stripe.Subscription) {
            const items: Stripe.SubscriptionCreateParams.Item[] = [];

            for (const item of oldSubscription.items.data) {
                const newPriceId = await priceImporter.recreate(item.price)
                items.push({
                    price: newPriceId
                })
            }

            // Get customer
            const customer = await newStripe.client.customers.retrieve(getObjectId(oldSubscription.customer));
            if (customer.deleted) {
                throw new Error(`Customer ${getObjectId(oldSubscription.customer)} has been permanently deleted and cannot be used for a new subscription`)
            }

            const oldPaymentMethod = oldSubscription.default_payment_method as Stripe.PaymentMethod | null

            if (!oldPaymentMethod) {
                throw new Error(`Subscription ${oldSubscription.id} has no payment method`)
            }

            const paymentMethods = await newStripe.client.customers.listPaymentMethods(getObjectId(oldSubscription.customer))
            let foundPaymentMethod: Stripe.PaymentMethod | undefined;
            for (const paymentMethod of paymentMethods.data) {
                // Check if this is the same payment method
                // The ID and fingerprint will be different
                if (paymentMethod.type === oldPaymentMethod.type && paymentMethod.card?.last4 === oldPaymentMethod.card?.last4 && paymentMethod.card?.exp_month === oldPaymentMethod.card?.exp_month && paymentMethod.card?.exp_year === oldPaymentMethod.card?.exp_year && paymentMethod.card?.brand === oldPaymentMethod.card?.brand) {
                    foundPaymentMethod = paymentMethod
                    break;
                }
            }

            if (!foundPaymentMethod) {
                throw new Error(`Could not find new payment method for subscription ${oldSubscription.id} and original payment method ${oldPaymentMethod.id}`)
            }

            // Create the subscription
            const subscription = await newStripe.client.subscriptions.create({
                customer: getObjectId(oldSubscription.customer),
                default_payment_method: foundPaymentMethod.id,
                items,
                billing_cycle_anchor: oldSubscription.current_period_end,
                cancel_at_period_end: false,
                coupon: undefined,
                trial_end: oldSubscription.trial_end ?? undefined,
                metadata: {
                    importOldId: oldSubscription.id
                }
            });
            return subscription.id
        }
    };

    return new Importer({
        objectName: 'subscription',
        stats,
        provider
    })
}
