import Stripe from 'stripe';
import Logger from '../Logger.js';
import {Options} from '../Options.js';
import {StripeAPI} from '../StripeAPI.js';
import {getObjectId, ifDryRun, ifDryRunJustReturnFakeId} from '../helpers.js';
import {ImportStats} from './ImportStats.js';
import {ImportWarning} from './ImportWarning.js';
import {Importer} from './Importer.js';

export function createSubscriptionImporter({oldStripe, newStripe, stats, priceImporter, couponImporter}: {
    dryRun: boolean,
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    stats: ImportStats,
    priceImporter: Importer<Stripe.Price>,
    couponImporter: Importer<Stripe.Coupon>
}) {
    const provider = {
        async getByID(oldId: string): Promise<Stripe.Subscription> {
            return oldStripe.client.subscriptions.retrieve(oldId, {expand: ['data.default_payment_method']});
        },

        getAll() {
            return oldStripe.client.subscriptions.list({
                limit: 100,
                expand: ['data.default_payment_method'],
                test_clock: Options.shared.testClock
            });
        },

        async findExisting(oldId: string) {
            const existing = await newStripe.client.subscriptions.search({
                query: `metadata['importOldId']:'${oldId}' AND status:"active"`
            });
            if (existing.data.length > 0) {
                return existing.data[0];
            }
        },

        async recreate(oldSubscription: Stripe.Subscription) {
            if (!['active', 'past_due', 'trialing'].includes(oldSubscription.status)) {
                throw new ImportWarning({
                    message: `Subscription ${oldSubscription.id} has a status of ${oldSubscription.status} and will not be recreated`
                });
            }

            const items: Stripe.SubscriptionCreateParams.Item[] = [];

            for (const item of oldSubscription.items.data) {
                const newPriceId = await priceImporter.recreate(item.price);
                items.push({
                    price: newPriceId,
                    quantity: item.quantity
                });
            }

            // Get customer
            Logger.vv?.info(`Getting customer ${getObjectId(oldSubscription.customer)}`);
            const customer = await newStripe.client.customers.retrieve(getObjectId(oldSubscription.customer));
            if (customer.deleted) {
                throw new Error(`Customer ${getObjectId(oldSubscription.customer)} has been permanently deleted and cannot be used for a new subscription`);
            }

            let oldPaymentMethod = oldSubscription.default_payment_method as Stripe.PaymentMethod | null;
            let foundPaymentMethodId: string | undefined;
            let foundSourceId: string | undefined;

            if (!oldPaymentMethod) {
                // Use customer's default payment method
                if (!customer.default_source) {
                    if (!customer.invoice_settings.default_payment_method) {
                        throw new Error(`Customer ${getObjectId(oldSubscription.customer)} does not have a default payment method and the subscription ${oldSubscription.id} does not have a default payment method`);
                    }
                    Logger.vv?.info(`Getting customer ${getObjectId(oldSubscription.customer)} default payment method`);
                    foundPaymentMethodId = getObjectId(customer.invoice_settings.default_payment_method);
                } else {
                    Logger.vv?.info(`Getting customer ${getObjectId(oldSubscription.customer)} default payment method source`);
                    foundSourceId = getObjectId(customer.default_source);
                }
            } else {
                Logger.vv?.info(`Getting customer ${getObjectId(oldSubscription.customer)} payment methods`);
                const paymentMethods = await newStripe.client.customers.listPaymentMethods(getObjectId(oldSubscription.customer));
                for (const paymentMethod of paymentMethods.data) {
                    // Check if this is the same payment method
                    // The ID and fingerprint will be different
                    if (paymentMethod.type === oldPaymentMethod.type && paymentMethod.card?.last4 === oldPaymentMethod.card?.last4 && paymentMethod.card?.exp_month === oldPaymentMethod.card?.exp_month && paymentMethod.card?.exp_year === oldPaymentMethod.card?.exp_year && paymentMethod.card?.brand === oldPaymentMethod.card?.brand) {
                        foundPaymentMethodId = paymentMethod.id;
                        break;
                    }
                }

                if (!foundPaymentMethodId) {
                    throw new Error(`Could not find new payment method for subscription ${oldSubscription.id} and original payment method ${oldPaymentMethod.id}`);
                }
            }

            Logger.vv?.info(`Getting coupon if needed`);
            const coupon = oldSubscription.discount?.coupon ? (await couponImporter.recreate(oldSubscription.discount?.coupon)) : undefined;

            // Create the subscription
            Logger.vv?.info(`Creating subscription`);

            const needsCharge = oldSubscription.status === 'past_due' && false;
            const now = new Date().getTime() / 1000;

            // Minimum billing_cycle_anchor is one hour in the future, to prevent immediate billing of the created subscription
            const minimumBillingCycleAnchor = Math.ceil(now) + 3600;
            const isTrial = oldSubscription.trial_end && oldSubscription.trial_end > (now + 10);

            const data: Stripe.SubscriptionCreateParams = {
                description: oldSubscription.description ?? undefined,
                customer: getObjectId(oldSubscription.customer),
                default_payment_method: foundPaymentMethodId,
                default_source: foundSourceId,
                items,
                billing_cycle_anchor: isTrial ? undefined : Math.max(minimumBillingCycleAnchor, oldSubscription.current_period_end),
                backdate_start_date: needsCharge ? oldSubscription.current_period_start : oldSubscription.start_date,
                proration_behavior: needsCharge ? 'create_prorations' : 'none', // Don't charge for backdated time
                cancel_at_period_end: oldSubscription.cancel_at_period_end,
                coupon,
                trial_end: isTrial ? oldSubscription.trial_end! : undefined, // Stripe returns trial end in the past, but doesn't allow it to be in the past when creating a subscription
                cancel_at: oldSubscription.cancel_at ?? undefined,
                metadata: {
                    oldCreatedAt: oldSubscription.created,
                    importOldId: oldSubscription.id
                },
                payment_behavior: 'error_if_incomplete' // Make sure we throw an error if we can't charge the customer
            };

            // Duplicate any open invoices from the old subscription
            const invoices = await oldStripe.client.invoices.list({
                subscription: oldSubscription.id,
                status: 'open'
            });

            return await ifDryRunJustReturnFakeId(async () => {
                const subscription = await newStripe.client.subscriptions.create(data);

                for (const oldInvoice of invoices.data) {
                    Logger.vv?.info(`Duplicating invoice ${oldInvoice.id} from old subscription ${oldSubscription.id} to new subscription ${subscription.id}`);
                    const invoice = await newStripe.client.invoices.create({
                        customer: getObjectId(oldSubscription.customer),
                        subscription: subscription.id,
                        auto_advance: false,
                        metadata: {
                            importOldId: oldInvoice.id
                        }
                    });

                    for (const item of oldInvoice.lines.data) {
                        Logger.vv?.info(`Duplicating invoice item ${item.id} from old invoice ${oldInvoice.id} to new invoice ${invoice.id}`);

                        const newPriceId = item.price ? await priceImporter.recreate(item.price) : undefined;

                        // Note: we cannot use the price here again, because we cannot assign a recurring price to an invoice item
                        const d = {
                            customer: getObjectId(oldSubscription.customer),
                            invoice: invoice.id,
                            //subscription: subscription.id,
                            //price: newPriceId,
                            //quantity: item.quantity ?? undefined,
                            amount: item.amount,
                            discountable: item.discountable,
                            period: {
                                start: item.period?.start,
                                end: item.period?.end
                            },
                            description: item.description ?? (item.price?.product as Stripe.Product).name,
                            currency: item.currency,
                            metadata: {
                                importOldId: item.id
                            }
                        };
                        await newStripe.client.invoiceItems.create(d);
                    }

                    // Advance the invoice
                    Logger.vv?.info(`Finalizing invoice ${invoice.id}`);
                    await newStripe.client.invoices.finalizeInvoice(invoice.id, {
                        auto_advance: true
                    });

                    // Force immediate payment
                    Logger.vv?.info(`Paying invoice ${invoice.id}`);

                    try {
                        await newStripe.client.invoices.pay(invoice.id);
                    } catch (e) {
                        // Faield charge
                        // Not an issue: subscription will be overdue
                    }
                }

                if (Options.shared.pause) {
                    // Pause old subscription
                    Logger.vv?.info(`Pausing old ${oldSubscription.id}`);
                    await oldStripe.client.subscriptions.update(oldSubscription.id, {
                        pause_collection: {
                            behavior: 'keep_as_draft'
                        }
                    });
                }

                return subscription.id;
            }, {
                oldSubscription,
                newSubscription: data
            });
        },

        async revert(oldSubscription: Stripe.Subscription, newSubscription: Stripe.Subscription) {
            await ifDryRun(async () => {
                await newStripe.client.subscriptions.del(getObjectId(newSubscription));

                if (Options.shared.pause) {
                    // Resume old subscription
                    Logger.vv?.info(`Resuming old ${oldSubscription.id}`);
                    await oldStripe.client.subscriptions.update(oldSubscription.id, {
                        pause_collection: ''
                    });

                    // TODO! resume draft invoices created!
                }
            });

            // Delete price if not yet deleted
            for (const item of oldSubscription.items.data) {
                await priceImporter.revert(item.price);
            }

            // Delete coupon if not yet deleted
            if (oldSubscription.discount?.coupon) {
                await couponImporter.revert(oldSubscription.discount?.coupon);
            }
        }
    };

    return new Importer({
        objectName: 'subscription',
        stats,
        provider
    });
}
