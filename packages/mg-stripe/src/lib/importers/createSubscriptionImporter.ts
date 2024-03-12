import Stripe from 'stripe';
import {Logger} from '../Logger.js';
import {Options} from '../Options.js';
import {StripeAPI} from '../StripeAPI.js';
import {getObjectId, ifNotDryRun, ifDryRunJustReturnFakeId} from '../helpers.js';
import {ImportStats} from './ImportStats.js';
import {ImportWarning} from './ImportWarning.js';
import Importer, {BaseImporter} from './Importer.js';
import {ImportError} from './ImportError.js';
import {ReportTags, Reporter} from './Reporter.js';

function tagSubscription(subscription: Stripe.Subscription, tags: ReportTags) {
    tags.addTag('Platform', (subscription.application as Stripe.Application)?.name ?? 'None');
    tags.addTag('Platform fees', (subscription.application_fee_percent ?? 0).toString() + '%');
    tags.addTag('Coupon', subscription.discount?.coupon?.name ?? 'None');
    tags.addTag('Status', subscription.status);
    tags.addTag('Cancel at period end', subscription.cancel_at_period_end ? 'Yes' : 'No');
    tags.addTag('Payment collection paused', subscription.pause_collection ? 'Yes' : 'No');
}

/**
 * CustomerSource can be a card, or a source with a card
 */
function getSourceCard(source: Stripe.CustomerSource): Stripe.Card | Stripe.Source.Card | undefined {
    if (source.object === 'card') {
        return source;
    }
    if (source.object === 'source' && source.type === 'card' && source.card) {
        return source.card;
    }
    return;
}

async function resumeSubscription(stripe: StripeAPI, subscription: Stripe.Subscription, stats?: ImportStats) {
    // Resume subscription
    stripe.use(client => client.subscriptions.update(subscription.id, {
        pause_collection: ''
    }));

    // Resume draft invoices created
    await finalizeDraftInvoices(stripe, subscription, stats);
}

async function finalizeDraftInvoices(stripe: StripeAPI, subscription: Stripe.Subscription, stats?: ImportStats) {
    // Resume draft invoices created
    const invoices = await stripe.use(client => client.invoices.list({
        subscription: subscription.id,
        status: 'draft'
    }));
    for (const invoice of invoices.data) {
        await stripe.use(client => client.invoices.finalizeInvoice(invoice.id, {
            auto_advance: true
        }));
        stats?.trackConfirmed('invoice');
    }
}

export function createSubscriptionImporter({oldStripe, newStripe, stats, priceImporter, couponImporter, delay, reporter}: {
    dryRun: boolean,
    oldStripe: StripeAPI,
    newStripe: StripeAPI,
    stats: ImportStats,
    reporter: Reporter,
    priceImporter: BaseImporter<Stripe.Price>,
    couponImporter: BaseImporter<Stripe.Coupon>,
    delay: number,
}) {
    const provider = {
        async getByID(oldId: string): Promise<Stripe.Subscription> {
            return oldStripe.use(client => client.subscriptions.retrieve(oldId, {expand: ['data.default_payment_method', 'data.default_source']}));
        },

        getAll() {
            return oldStripe.useAsyncIterator(client => client.subscriptions.list({
                limit: 100,
                expand: ['data.default_payment_method', 'data.default_source'],
                test_clock: Options.shared.testClock
            }));
        },

        async findExisting(oldSubscription: Stripe.Subscription) {
            try {
                // Note: we don't use search here, because that is not read-write consistent + slower
                const existing = await newStripe.use(client => client.subscriptions.list({
                    customer: getObjectId(oldSubscription.customer),
                    limit: 100,
                    expand: ['data.default_payment_method', 'data.default_source']
                }));

                // Return the first with metadata['ghost_migrate_id'] === oldSubscription.id
                for (const subscription of existing.data) {
                    if (subscription.metadata.ghost_migrate_id === oldSubscription.id) {
                        return subscription;
                    }
                }
            } catch (err: any) {
                if (err.message && err.message.includes('No such customer')) {
                    throw new ImportWarning({
                        message: `Customer ${getObjectId(oldSubscription.customer)} not found. Skipping...`
                    });
                }
                throw err;
            }
        },

        async recreate(oldSubscription: Stripe.Subscription, tags: ReportTags) {
            // Some stats:
            // Best to add these asap so we also have this data available in case of an error, which helps with debugging
            tagSubscription(oldSubscription, tags);

            if (!['active', 'past_due', 'trialing'].includes(oldSubscription.status)) {
                tags.addTag('reason', `Status is ${oldSubscription.status}`);

                throw new ImportWarning({
                    message: `Subscription ${oldSubscription.id} has a status of ${oldSubscription.status} and will not be recreated`
                });
            }

            // Do checks of supporte features we definitly don't support
            if (oldSubscription.collection_method === 'send_invoice') {
                tags.addTag('reason', 'Send invoice not supported');

                throw new ImportWarning({
                    message: `Subscription ${oldSubscription.id} uses collection_method: send_invoice which is not supported`
                });
            }

            if (oldSubscription.pause_collection) {
                tags.addTag('reason', 'Payment collection paused');

                throw new ImportWarning({
                    message: `Subscription ${oldSubscription.id} has payment collection paused`
                });
            }

            if ((oldSubscription.application as Stripe.Application) && (oldSubscription.application as Stripe.Application).name === 'Ghost') {
                tags.addTag('reason', 'Created by Ghost');

                throw new ImportWarning({
                    message: `Subscription ${oldSubscription.id} was created by Ghost and will not be recreated`
                });
            }

            if (oldSubscription.items.data.length > 1 || oldSubscription.items.has_more) {
                tags.addTag('reason', 'Subscription has multiple items, which is not supported in Ghost');

                throw new ImportWarning({
                    message: `Subscription ${oldSubscription.id} has multiple line items`
                });
            }

            const items: Stripe.SubscriptionCreateParams.Item[] = [];

            for (const item of oldSubscription.items.data) {
                if (item.quantity !== 1) {
                    tags.addTag('reason', 'Subscription has an item with quantity != 1, which is not supported in Ghost');

                    throw new ImportWarning({
                        message: `Subscription ${oldSubscription.id} has an item with quantity != 1`
                    });
                }

                const newPriceId = await priceImporter.recreate(item.price);
                items.push({
                    price: newPriceId,
                    quantity: item.quantity,
                    metadata: item.metadata
                });
            }

            // Get customer
            Logger.vv?.info(`Getting customer ${getObjectId(oldSubscription.customer)}`);

            let customer: Stripe.Customer | Stripe.DeletedCustomer;
            try {
                customer = await newStripe.use(client => client.customers.retrieve(getObjectId(oldSubscription.customer)));
            } catch (err: any) {
                if (err.message && err.message.includes('No such customer')) {
                    tags.addTag('reason', 'Customer not found');

                    throw new ImportWarning({
                        message: `Customer ${getObjectId(oldSubscription.customer)} not found. Skipping...`
                    });
                }
                throw err;
            }

            if (customer.deleted) {
                tags.addTag('reason', 'Deleted customer');

                throw new ImportWarning({
                    message: `Customer ${getObjectId(oldSubscription.customer)} has been permanently deleted and cannot be used for a new subscription`
                });
            }

            let oldPaymentMethod = oldSubscription.default_payment_method as Stripe.PaymentMethod | null;
            let foundPaymentMethodId: string | undefined;
            let foundSourceId: string | undefined;
            let oldPaymentSource = oldSubscription.default_source as Stripe.CustomerSource | null;

            const cardSource = oldPaymentSource ? getSourceCard(oldPaymentSource) : undefined;

            if (cardSource && !oldPaymentMethod && oldPaymentSource) {
                // Get sources
                Logger.vv?.info(`Getting customer ${getObjectId(oldSubscription.customer)} payment sources`);
                const sources = await newStripe.use(client => client.customers.listSources(getObjectId(oldSubscription.customer)));

                for (const source of sources.data) {
                    const card = getSourceCard(source);
                    if (!card) {
                        continue;
                    }

                    // Check if this is the same source
                    // The ID and fingerprint will be different
                    if (card.last4 === cardSource.last4 && card.exp_month === cardSource.exp_month && card.exp_year === cardSource.exp_year && card.brand === cardSource.brand) {
                        foundSourceId = source.id;
                        break;
                    }
                }

                if (!foundSourceId) {
                    tags.addTag('reason', 'Payment source not found');

                    throw new ImportError({
                        message: `Could not find new payment source for subscription ${oldSubscription.id} and original payment source ${oldPaymentSource.id}`
                    });
                }
            } else if (!oldPaymentMethod) {
                // Use customer's default payment method
                if (!customer.default_source) {
                    if (!customer.invoice_settings.default_payment_method) {
                        tags.addTag('reason', 'No default payment method');
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
                const paymentMethods = await newStripe.use(client => client.customers.listPaymentMethods(getObjectId(oldSubscription.customer)));
                for (const paymentMethod of paymentMethods.data) {
                    // Check if this is the same payment method
                    // The ID and fingerprint will be different
                    if (paymentMethod.type === oldPaymentMethod.type && paymentMethod.card?.last4 === oldPaymentMethod.card?.last4 && paymentMethod.card?.exp_month === oldPaymentMethod.card?.exp_month && paymentMethod.card?.exp_year === oldPaymentMethod.card?.exp_year && paymentMethod.card?.brand === oldPaymentMethod.card?.brand) {
                        foundPaymentMethodId = paymentMethod.id;
                        break;
                    }
                }

                if (!foundPaymentMethodId) {
                    tags.addTag('reason', 'No payment method set');

                    throw new ImportError({
                        message: `Could not find new payment method for subscription ${oldSubscription.id} and original payment method ${oldPaymentMethod.id}`
                    });
                }
            }

            Logger.vv?.info(`Getting coupon if needed`);
            const coupon = oldSubscription.discount?.coupon ? (await couponImporter.recreate(oldSubscription.discount?.coupon)) : undefined;

            const now = new Date().getTime() / 1000;

            // Minimum billing_cycle_anchor is one hour in the future, to prevent immediate billing of the created subscription
            const minimumFirstCharge = 3600 * Math.max(0.5, delay); // Wait x hours
            const minimumBillingCycleAnchor = Math.ceil(now) + minimumFirstCharge;
            const isTrial = oldSubscription.trial_end && oldSubscription.trial_end > (now + 10);

            const data: Stripe.SubscriptionCreateParams = {
                description: oldSubscription.description ?? undefined,
                customer: getObjectId(oldSubscription.customer),
                default_payment_method: foundPaymentMethodId,
                default_source: foundSourceId,
                items,
                billing_cycle_anchor: isTrial ? undefined : Math.max(minimumBillingCycleAnchor, oldSubscription.current_period_end),
                backdate_start_date: oldSubscription.start_date,
                proration_behavior: 'none', // Don't charge for backdated time
                cancel_at_period_end: oldSubscription.cancel_at ? undefined : oldSubscription.cancel_at_period_end, // Can't set cancel_at and cancel_at_period_end at the same time (even if they make sense)
                coupon,
                trial_end: isTrial ? oldSubscription.trial_end! : undefined, // Stripe returns trial end in the past, but doesn't allow it to be in the past when creating a subscription
                cancel_at: oldSubscription.cancel_at ?? undefined,
                metadata: {
                    ghost_migrate_created: oldSubscription.created,
                    ghost_migrate_id: oldSubscription.id,
                    ghost_migrate_start_date: oldSubscription.start_date,
                    ghost_migrate_current_period_start: oldSubscription.current_period_start,
                    ghost_migrate_current_period_end: oldSubscription.current_period_end,
                    ghost_migrate_trial_end: oldSubscription.trial_end
                },
                payment_behavior: 'error_if_incomplete' // Make sure we throw an error if we can't charge the customer
            };

            // Duplicate any open invoices from the old subscription
            const invoices = await oldStripe.use(client => client.invoices.list({
                subscription: oldSubscription.id,
                status: 'open'
            }));

            tags.addTag('Has open invoices', invoices.data.length > 0 ? 'Yes' : 'No');

            return await ifDryRunJustReturnFakeId(async () => {
                // Pause old subscription
                Logger.vv?.info(`Pausing old ${oldSubscription.id}`);
                await oldStripe.use(client => client.subscriptions.update(oldSubscription.id, {
                    pause_collection: {
                        behavior: 'keep_as_draft'
                    }
                }));

                // Create the subscription
                Logger.vv?.info(`Creating subscription`);
                const subscription = await newStripe.use(client => client.subscriptions.create(data));

                for (const oldInvoice of invoices.data) {
                    Logger.vv?.info(`Duplicating invoice ${oldInvoice.id} from old subscription ${oldSubscription.id} to new subscription ${subscription.id}`);
                    const invoice = await newStripe.use(client => client.invoices.create({
                        customer: getObjectId(oldSubscription.customer),
                        subscription: subscription.id,
                        auto_advance: false,
                        metadata: {
                            ghost_migrate_id: oldInvoice.id
                        }
                    }));

                    for (const item of oldInvoice.lines.data) {
                        Logger.vv?.info(`Duplicating invoice item ${item.id} from old invoice ${oldInvoice.id} to new invoice ${invoice.id}`);

                        // Note: we cannot use the price here again, because we cannot assign a recurring price to an invoice item
                        const d = {
                            customer: getObjectId(oldSubscription.customer),
                            invoice: invoice.id,
                            amount: item.amount,
                            discountable: item.discountable,
                            period: {
                                start: item.period?.start,
                                end: item.period?.end
                            },
                            description: item.description ?? (item.price?.product as Stripe.Product).name,
                            currency: item.currency,
                            metadata: {
                                ghost_migrate_id: item.id
                            }
                        };
                        await newStripe.use(client => client.invoiceItems.create(d));
                    }

                    stats.trackImported('invoice');
                }

                return subscription.id;
            }, {
                oldSubscription,
                newSubscription: data
            });
        },

        async revert(oldSubscription: Stripe.Subscription, newSubscription: Stripe.Subscription, tags: ReportTags) {
            tagSubscription(oldSubscription, tags);

            await ifNotDryRun(async () => {
                // Void draft invoices that were created
                // Via workaround refs https://github.com/stripe/stripe-node/issues/657
                const invoices = await newStripe.use(client => client.invoices.list({
                    subscription: getObjectId(newSubscription),
                    limit: 100
                }));

                for (const invoice of invoices.data) {
                    if (!invoice.metadata?.ghost_migrate_id) {
                        // Not created by us
                        continue;
                    }

                    // Add a note
                    await newStripe.use(client => client.invoices.update(invoice.id, {
                        description: 'This draft invoice was created during a platform migration. You will not get charged.'
                    }));

                    // Make sure we can void
                    if (invoice.status === 'draft') {
                        Logger.vv?.warn(`Cannot delete/void draft invoice ${invoice.id} from new subscription ${newSubscription.id} - Stripe limitation. Kept as draft with a note and deleted all the invoice items instead.`);

                        // Delete invoice items
                        const invoiceItems = await newStripe.use(client => client.invoiceItems.list({
                            invoice: invoice.id,
                            limit: 100
                        }));
                        for (const invoiceItem of invoiceItems.data) {
                            await newStripe.use(client => client.invoiceItems.del(invoiceItem.id));
                        }
                    } else {
                        // Void it
                        Logger.vv?.info(`Voiding invoice ${invoice.id} from new subscription ${newSubscription.id}`);
                        await newStripe.use(client => client.invoices.voidInvoice(invoice.id, {}));
                    }
                    stats.trackReverted('invoice');
                }

                await newStripe.use(client => client.subscriptions.del(getObjectId(newSubscription)));

                // Unpause old subscription
                Logger.vv?.info(`Resuming old ${oldSubscription.id}`);
                await resumeSubscription(oldStripe, oldSubscription); // Don't pass stats here, we don't confirm invoices here
            });

            // Delete price if not yet deleted
            for (const item of oldSubscription.items.data) {
                await priceImporter.revert(item.price);
            }

            // Delete coupon if not yet deleted
            if (oldSubscription.discount?.coupon) {
                await couponImporter.revert(oldSubscription.discount?.coupon);
            }
        },

        async confirm(oldSubscription: Stripe.Subscription, newSubscription: Stripe.Subscription, tags: ReportTags) {
            tagSubscription(oldSubscription, tags);

            if (oldSubscription.status === 'canceled') {
                await ifNotDryRun(async () => {
                    // Cancel new subscription
                    await newStripe.use(client => client.subscriptions.del(getObjectId(newSubscription)));
                });

                stats.trackReverted('subscription');

                tags.addTag('reason', `Old subscription was canceled during the migration`);
                tags.addTag('action', `The new subscription has also been deleted`);

                throw new ImportWarning({
                    message: `Old subscription was ${oldSubscription.id} canceled, deleting the new subscription too`
                });
            }

            await ifNotDryRun(async () => {
                // Cancel new subscription
                await oldStripe.use(client => client.subscriptions.del(getObjectId(oldSubscription)));

                // Unpause new subscription
                Logger.vv?.info(`Finalizing ${newSubscription.id}`);
                await finalizeDraftInvoices(newStripe, newSubscription, stats);
            });
        }
    };

    return new Importer({
        objectName: 'Subscription',
        stats,
        provider,
        reporter
    });
}
