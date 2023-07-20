import Stripe from 'stripe';
import {StripeAPI} from '../lib/StripeAPI.js';
import {ImportStats} from '../lib/importers/ImportStats.js';
import {createCouponImporter} from '../lib/importers/createCouponImporter.js';
import {createPriceImporter} from '../lib/importers/createPriceImporter.js';
import {createProductImporter} from '../lib/importers/createProductImporter.js';
import {createSubscriptionImporter} from '../lib/importers/createSubscriptionImporter.js';
import {advanceClock, buildCoupon, buildDiscount, buildInvoice, buildPrice, buildProduct, buildSubscription, createDeclinedCustomer, createPaymentMethod, createSource, createValidCustomer, getStripeTestAPIKey} from './utils/stripe.js';
import {Options} from '../lib/Options.js';
import assert from 'assert/strict';
import sinon from 'sinon';
import {isWarning} from '../lib/helpers.js';
import DryRunIdGenerator from '../lib/DryRunIdGenerator.js';

const stripeTestApiKey = getStripeTestAPIKey();

describe('Recreating subscriptions', () => {
    const stripe = new StripeAPI({apiKey: stripeTestApiKey});
    let stats: ImportStats;
    let subscriptionImporter: ReturnType<typeof createSubscriptionImporter>;
    let validCustomer: Stripe.Customer;
    let declinedCustomer: Stripe.Customer;
    let currentInvoices: Stripe.Invoice[];

    beforeAll(async () => {
        const {customer: vc} = await createValidCustomer(stripe.debugClient, {testClock: false});
        const {customer: dc} = await createDeclinedCustomer(stripe.debugClient, {testClock: false});

        validCustomer = vc;
        declinedCustomer = dc;
    });

    beforeEach(async () => {
        stats = new ImportStats();
        currentInvoices = [];
        const sharedOptions = {
            dryRun: false,
            stats,
            oldStripe: new StripeAPI({apiKey: ''}), // old is invalid to prevent usage
            newStripe: stripe
        };

        Options.init({
            'force-recreate': true,
            'very-verbose': true,
            delay: 1
        });

        const productImporter = createProductImporter({
            ...sharedOptions
        });

        const priceImporter = createPriceImporter({
            ...sharedOptions,
            productImporter
        });

        const couponImporter = createCouponImporter({
            ...sharedOptions
        });

        subscriptionImporter = createSubscriptionImporter({
            ...sharedOptions,
            priceImporter,
            couponImporter
        });

        sinon.stub(sharedOptions.oldStripe.debugClient.invoices, 'list').callsFake(() => {
            return Promise.resolve({
                data: currentInvoices,
                object: 'list',
                has_more: false,
                url: ''
            }) as Stripe.ApiListPromise<Stripe.Invoice>;
        });

        sinon.stub(sharedOptions.oldStripe.debugClient.subscriptions, 'update').callsFake(() => {
            return Promise.resolve({} as Stripe.Response<Stripe.Subscription>);
        });
    });

    it('Monthly subscription', async () => {
        const {customer, clock} = await createValidCustomer(stripe.debugClient, {testClock: true});
        const oldProduct = buildProduct({});

        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            customer: customer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
        assert.equal(newSubscription.trial_end, null);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, customer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, customer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoices.data.length, 0);

        // Check upcoming invoice
        const upcomingInvoice = await stripe.use(client => client.invoices.retrieveUpcoming({
            customer: customer.id,
            subscription: newSubscription.id
        }));
        assert.equal(upcomingInvoice.amount_due, 100);
        assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);
        assert.ok(upcomingInvoice.lines.data[0].period.end >= oldSubscription.current_period_end + 27 * 24 * 60 * 60);
        assert.ok(upcomingInvoice.lines.data[0].period.end <= oldSubscription.current_period_end + 32 * 24 * 60 * 60);

        // Now wait for the period to end
        await advanceClock({
            clock,
            stripe: stripe.debugClient,
            time: currentPeriodEnd + 60 * 60
        });

        // Check one draft invoice has been created
        const newInvoicesAfter = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoicesAfter.data.length, 1);
        assert.equal(newInvoicesAfter.data[0].amount_due, 100);
        assert.equal(newInvoicesAfter.data[0].status, 'paid');
        assert.equal(newInvoicesAfter.data[0].amount_paid, 100);

        // Now confirm
        await subscriptionImporter.confirm(oldSubscription);

        // Wait one hour
        await advanceClock({
            clock,
            stripe: stripe.debugClient,
            time: currentPeriodEnd + 60 * 60 * 2
        });

        // Check no difference
        const newInvoicesAfterConfirm = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));

        assert.equal(newInvoicesAfterConfirm.data.length, 1);
        assert.equal(newInvoicesAfterConfirm.data[0].amount_due, 100);
        assert.equal(newInvoicesAfterConfirm.data[0].status, 'paid');
        assert.equal(newInvoicesAfterConfirm.data[0].amount_paid, 100);
    });

    it('Yearly subscription', async () => {
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 365 * 24 * 60 * 60;

        const oldProduct = buildProduct({
            name: 'Yearly Subscription'
        });

        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'year'
            }
        });

        const oldSubscription = buildSubscription({
            customer: validCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
        assert.equal(newSubscription.trial_end, null);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, validCustomer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, validCustomer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoices.data.length, 0);

        // Check upcoming invoice
        const upcomingInvoice = await stripe.use(client => client.invoices.retrieveUpcoming({
            customer: validCustomer.id,
            subscription: newSubscription.id
        }));
        assert.equal(upcomingInvoice.amount_due, 100);
        assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);
        assert.ok(upcomingInvoice.lines.data[0].period.end >= oldSubscription.current_period_end + 363 * 24 * 60 * 60);
        assert.ok(upcomingInvoice.lines.data[0].period.end <= oldSubscription.current_period_end + 366 * 24 * 60 * 60);
    });

    it('Trial subscriptions', async () => {
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            status: 'trialing',
            customer: validCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            trial_end: currentPeriodEnd
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'trialing');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
        assert.equal(newSubscription.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, validCustomer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, validCustomer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoices.data.length, 1);
        assert.equal(newInvoices.data[0].status, 'paid');
        assert.equal(newInvoices.data[0].amount_due, 0);
        assert.equal(newInvoices.data[0].amount_paid, 0);
        assert.equal(newInvoices.data[0].lines.data[0].period.end, oldSubscription.current_period_end);
        assert.equal(newInvoices.data[0].lines.data[0].period.start, oldSubscription.start_date);
    });

    it('Trial subscriptions that end in the next 30s', async () => {
        const {customer, clock} = await createValidCustomer(stripe.debugClient, {
            testClock: true
        });
        const now = Math.floor(new Date().getTime() / 1000);
        const trialEnd = now + 30;
        const currentPeriodEnd = trialEnd;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            status: 'trialing',
            customer: customer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            trial_end: trialEnd
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'trialing');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, oldSubscription.trial_end);
        assert.equal(newSubscription.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, customer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, customer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoices.data.length, 1);
        assert.equal(newInvoices.data[0].status, 'paid');
        assert.equal(newInvoices.data[0].amount_due, 0);
        assert.equal(newInvoices.data[0].amount_paid, 0);
        assert.equal(newInvoices.data[0].lines.data[0].period.end, oldSubscription.trial_end);
        assert.equal(newInvoices.data[0].lines.data[0].period.start, oldSubscription.start_date);

        // Wait for trial to end
        await advanceClock({
            clock,
            stripe: stripe.debugClient,
            time: trialEnd + 60 * 60
        });

        // Check status
        const newSubscriptionAfterTrial = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));
        assert.equal(newSubscriptionAfterTrial.status, 'active');
        assert.equal(newSubscriptionAfterTrial.current_period_start, trialEnd);

        // Check invoices
        const newInvoicesAfterTrial = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));

        // Sort
        newInvoicesAfterTrial.data.sort((a, b) => {
            return a.created - b.created;
        });

        assert.equal(newInvoicesAfterTrial.data.length, 2);
        assert.equal(newInvoicesAfterTrial.data[0].status, 'paid');
        assert.equal(newInvoicesAfterTrial.data[0].amount_due, 0);
        assert.equal(newInvoicesAfterTrial.data[0].amount_paid, 0);

        assert.equal(newInvoicesAfterTrial.data[1].status, 'paid');
        assert.equal(newInvoicesAfterTrial.data[1].amount_due, 100);
        assert.equal(newInvoicesAfterTrial.data[1].amount_paid, 100);
    });

    it('Trial subscriptions that end in the past', async () => {
        const customer = validCustomer;
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;
        const trialEnd = now - 1;

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            status: 'trialing',
            customer: customer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            trial_end: trialEnd
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
        assert.equal(newSubscription.trial_end, null);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, customer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, customer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoices.data.length, 0);
    });

    it('Subscription that renews today', async () => {
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const oldProduct = buildProduct({});

        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            customer: validCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);

        // Check current period end is extended to 1 hour from now to avoid immediate billing
        assert.ok(newSubscription.current_period_end < Math.ceil(Date.now() / 1000) + 3600 + 60);
        assert.ok(newSubscription.current_period_end > Math.ceil(Date.now() / 1000) + 3600 - 60);

        assert.equal(newSubscription.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, validCustomer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, validCustomer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoices.data.length, 0);
    });

    it('Subsciption that renews today and will be declined delays charge', async () => {
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            customer: declinedCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);

        // Check current period end is extended to 1 hour from now to avoid immediate billing
        assert.ok(newSubscription.current_period_end < Math.ceil(Date.now() / 1000) + 3600 + 60);
        assert.ok(newSubscription.current_period_end > Math.ceil(Date.now() / 1000) + 3600 - 60);

        assert.equal(newSubscription.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, declinedCustomer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, declinedCustomer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoices.data.length, 0);
    });

    it('Past Due Subscription', async () => {
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 17 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const {customer, clock} = await createDeclinedCustomer(stripe.debugClient, {testClock: true});

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            status: 'past_due',
            customer: customer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_end: currentPeriodEnd,
            current_period_start: currentPeriodStart
        });

        const invoice: Stripe.Invoice = buildInvoice({
            customer: customer.id,
            subscription: oldSubscription.id,
            lines: [
                {
                    price: oldPrice,
                    period: {
                        start: currentPeriodStart,
                        end: currentPeriodEnd
                    }
                }
            ]
        });

        // Return these invoices when we ask Stripe
        currentInvoices = [invoice];

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
        assert.equal(newSubscription.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, customer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, customer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Wait 1 hour for the payment retry
        // Advance time until current period end
        await advanceClock({
            clock,
            stripe: stripe.debugClient,
            time: now + 3600 + 60
        });
        const newSubscriptionAfterRetry = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));
        assert.equal(newSubscriptionAfterRetry.status, 'past_due');
        assert.equal(newSubscriptionAfterRetry.start_date, oldSubscription.start_date);
        assert.equal(newSubscriptionAfterRetry.current_period_end, oldSubscription.current_period_end);
        assert.equal(newSubscriptionAfterRetry.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscriptionAfterRetry.cancel_at_period_end, oldSubscription.cancel_at_period_end);

        // Check created invoices from the subscription
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoices.data.length, 1);
        assert.equal(newInvoices.data[0].status, 'open');
        assert.equal(newInvoices.data[0].attempt_count, 1);
        assert.equal(newInvoices.data[0].amount_due, 100);
        assert.equal(newInvoices.data[0].customer, customer.id);

        // Check upcoming invoice
        const upcomingInvoice = await stripe.use(client => client.invoices.retrieveUpcoming({
            customer: customer.id,
            subscription: newSubscription.id
        }));
        assert.equal(upcomingInvoice.amount_due, 100);
        assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);

        // Advance time until current period end
        await advanceClock({
            clock,
            stripe: stripe.debugClient,
            time: oldSubscription.current_period_end - 60 * 60
        });

        // Should be canceled now (depends on account settings!)
        // If this fails the test, check if your stripe account is setup to cancel subscriptions if they fail too many times
        const newSubscriptionAfterDue = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));
        assert.equal(newSubscriptionAfterDue.status, 'canceled');

        // Check no other invoices were created
        const newInvoicesAfterDue = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoicesAfterDue.data.length, 1);
    });

    it('Subscriptions that were canceled (at period end)', async () => {
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const {customer, clock} = await createValidCustomer(stripe.debugClient, {testClock: true});

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            status: 'active',
            customer: customer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_end: currentPeriodEnd,
            current_period_start: currentPeriodStart,
            cancel_at_period_end: true
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, currentPeriodEnd);
        assert.equal(newSubscription.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscription.cancel_at_period_end, true);
        assert.equal(newSubscription.customer, customer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, customer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Check did not create invoices from the subscription
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoices.data.length, 0);

        // Check no upcoming invoice
        await assert.rejects(stripe.use(client => client.invoices.retrieveUpcoming({
            customer: customer.id,
            subscription: newSubscription.id
        })), /No upcoming invoices for customer/);

        // Advance time until current period end
        await advanceClock({
            clock,
            stripe: stripe.debugClient,
            time: currentPeriodEnd + 10
        });

        // Should be canceled now
        const newSubscriptionAfterDue = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));
        assert.equal(newSubscriptionAfterDue.status, 'canceled');

        // Check no other invoices were created
        const newInvoicesAfterDue = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        assert.equal(newInvoicesAfterDue.data.length, 0);
    });

    it('Canceled subscriptions are ignored', async () => {
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            status: 'canceled',
            customer: validCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_end: currentPeriodEnd,
            current_period_start: currentPeriodStart
        });

        await assert.rejects(subscriptionImporter.recreateAndConfirm(oldSubscription), (thrown) => {
            return isWarning(thrown) && !!thrown.toString().match(/has a status of canceled/);
        });
    });

    it('Unpaid subscriptions are ignored', async () => {
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            status: 'unpaid',
            customer: validCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_end: currentPeriodEnd,
            current_period_start: currentPeriodStart
        });

        await assert.rejects(subscriptionImporter.recreateAndConfirm(oldSubscription), (thrown) => {
            return isWarning(thrown) && !!thrown.toString().match(/has a status of unpaid/);
        });
    });

    it('Subscription with a coupon that has already been applied 2/3 times will only apply it for one last time', async () => {
        const {customer, clock} = await createValidCustomer(stripe.debugClient, {testClock: true});
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;
        const startDate = currentPeriodStart - 31 * 24 * 60 * 60;

        const coupon = buildCoupon({
            duration: 'repeating',
            duration_in_months: 3,
            percent_off: 10
        });

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            status: 'active',
            customer: customer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_end: currentPeriodEnd,
            current_period_start: currentPeriodStart,
            start_date: startDate,
            discount: buildDiscount({
                coupon
            })
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');

        // Advance time until the end of the coupon (3 months after start date)
        await advanceClock({
            clock,
            stripe: stripe.debugClient,
            time: startDate + 3 * 31 * 24 * 60 * 60 + 60 * 60 * 2
        });

        // Check we generated two incoices: one with the discount and one without
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        // Sort invoices by date
        newInvoices.data.sort((a, b) => {
            return a.created - b.created;
        });

        assert.equal(newInvoices.data.length, 2);

        // Check the first invoice has the discount
        const firstInvoice = newInvoices.data[0];
        assert.ok(firstInvoice.discount?.coupon.id);
        assert.equal(firstInvoice.amount_paid, 90);
        assert.equal(firstInvoice.amount_due, 90);

        // Check the second invoice does not have the discount
        const secondInvoice = newInvoices.data[1];
        assert.equal(secondInvoice.discount, null);
        assert.equal(secondInvoice.amount_paid, 100);
        assert.equal(secondInvoice.amount_due, 100);
    });

    it('Subscription with a coupon that has already been applied 2/2 times will not apply it again', async () => {
        const {customer, clock} = await createValidCustomer(stripe.debugClient, {testClock: true});
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;
        const startDate = currentPeriodStart - 31 * 24 * 60 * 60;

        const coupon = buildCoupon({
            duration: 'repeating',
            duration_in_months: 2,
            percent_off: 10
        });

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription = buildSubscription({
            status: 'active',
            customer: customer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_end: currentPeriodEnd,
            current_period_start: currentPeriodStart,
            start_date: startDate,
            discount: buildDiscount({
                coupon
            })
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');

        // Advance time until the end of the coupon (3 months after start date)
        await advanceClock({
            clock,
            stripe: stripe.debugClient,
            time: startDate + 3 * 31 * 24 * 60 * 60 + 60 * 60 * 2
        });

        // Check we generated two incoices: one with the discount and one without
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        // Sort invoices by date
        newInvoices.data.sort((a, b) => {
            return a.created - b.created;
        });

        assert.equal(newInvoices.data.length, 2);

        // Check the first invoice does not have the discount
        const firstInvoice = newInvoices.data[0];
        assert.equal(firstInvoice.discount, null);
        assert.equal(firstInvoice.amount_paid, 100);
        assert.equal(firstInvoice.amount_due, 100);

        // Check the second invoice does not have the discount
        const secondInvoice = newInvoices.data[1];
        assert.equal(secondInvoice.discount, null);
        assert.equal(secondInvoice.amount_paid, 100);
        assert.equal(secondInvoice.amount_due, 100);
    });

    it('Subscription that has been cancelled at a manual future date', async () => {
        const {customer, clock} = await createValidCustomer(stripe.debugClient, {testClock: true});
        const now = Math.floor(new Date().getTime() / 1000);

        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;
        const startDate = currentPeriodStart - 31 * 24 * 60 * 60;
        const cancelAt = currentPeriodEnd + (31 + 15) * 24 * 60 * 60;

        const oldProduct = buildProduct({});
        const oldPrice = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            },
            unit_amount: 15 * 100
        });

        const oldSubscription = buildSubscription({
            status: 'active',
            customer: customer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_end: currentPeriodEnd,
            current_period_start: currentPeriodStart,
            start_date: startDate,
            cancel_at: cancelAt
        });

        const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
        const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

        // Do some basic assertions
        assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');

        // Advance time until the cancelAt date + 2 hours
        await advanceClock({
            clock,
            stripe: stripe.debugClient,
            time: cancelAt + 60 * 60 * 2
        });

        const newSubscriptionAfterCancel = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));
        assert.equal(newSubscriptionAfterCancel.status, 'canceled');

        // Check we generated two incoice
        const newInvoices = await stripe.use(client => client.invoices.list({
            subscription: newSubscription.id
        }));
        // Sort invoices by date
        newInvoices.data.sort((a, b) => {
            return a.created - b.created;
        });

        assert.equal(newInvoices.data.length, 2);

        const firstInvoice = newInvoices.data[0];
        assert.equal(firstInvoice.discount, null);
        assert.equal(firstInvoice.amount_paid, 15 * 100);
        assert.equal(firstInvoice.amount_due, 15 * 100);

        // Only charged partially
        const secondInvoice = newInvoices.data[1];
        assert.equal(secondInvoice.discount, null);
        assert.equal(secondInvoice.amount_paid, 750);
        assert.equal(secondInvoice.amount_due, 750);
    });

    describe('Payment methods', () => {
        test.skip('Default payment method on customer', async () => {
            // Already tested in other tests
        });

        test('Default source on customer', async () => {
            const {customer, clock} = await createValidCustomer(stripe.debugClient, {testClock: true, method: 'source'});
            const oldProduct = buildProduct({});

            const now = Math.floor(new Date().getTime() / 1000);
            const currentPeriodEnd = now + 15 * 24 * 60 * 60;
            const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

            const oldPrice = buildPrice({
                product: oldProduct,
                recurring: {
                    interval: 'month'
                }
            });

            const oldSubscription = buildSubscription({
                customer: customer.id,
                items: [
                    {
                        price: oldPrice
                    }
                ],
                current_period_start: currentPeriodStart,
                current_period_end: currentPeriodEnd
            });

            const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
            const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

            // Do some basic assertions
            assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
            assert.equal(newSubscription.status, 'active');
            assert.equal(newSubscription.start_date, oldSubscription.start_date);
            assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
            assert.equal(newSubscription.trial_end, null);
            assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
            assert.equal(newSubscription.customer, customer.id);
            assert.equal(newSubscription.description, oldSubscription.description);
            assert.equal(newSubscription.default_payment_method, null);
            assert.equal(newSubscription.default_source, customer.default_source);
            assert.equal(newSubscription.items.data.length, 1);
            assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
            assert.equal(newSubscription.items.data[0].quantity, 1);

            // Did not charge yet
            const newInvoices = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));
            assert.equal(newInvoices.data.length, 0);

            // Check upcoming invoice
            const upcomingInvoice = await stripe.use(client => client.invoices.retrieveUpcoming({
                customer: customer.id,
                subscription: newSubscription.id
            }));
            assert.equal(upcomingInvoice.amount_due, 100);
            assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);
            assert.ok(upcomingInvoice.lines.data[0].period.end >= oldSubscription.current_period_end + 27 * 24 * 60 * 60);
            assert.ok(upcomingInvoice.lines.data[0].period.end <= oldSubscription.current_period_end + 32 * 24 * 60 * 60);

            // Now wait for the period to end
            await advanceClock({
                clock,
                stripe: stripe.debugClient,
                time: currentPeriodEnd + 60 * 60
            });

            // Check one draft invoice has been created
            const newInvoicesAfter = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));
            assert.equal(newInvoicesAfter.data.length, 1);
            assert.equal(newInvoicesAfter.data[0].amount_due, 100);
            assert.equal(newInvoicesAfter.data[0].status, 'paid');
            assert.equal(newInvoicesAfter.data[0].amount_paid, 100);

            // Now confirm
            await subscriptionImporter.confirm(oldSubscription);

            // Wait one hour
            await advanceClock({
                clock,
                stripe: stripe.debugClient,
                time: currentPeriodEnd + 60 * 60 * 2
            });

            // Check no difference
            const newInvoicesAfterConfirm = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));

            assert.equal(newInvoicesAfterConfirm.data.length, 1);
            assert.equal(newInvoicesAfterConfirm.data[0].amount_due, 100);
            assert.equal(newInvoicesAfterConfirm.data[0].status, 'paid');
            assert.equal(newInvoicesAfterConfirm.data[0].amount_paid, 100);
        });

        test('Default payment method on subscription', async () => {
            // Customer with default payment method
            const {customer, clock} = await createValidCustomer(stripe.debugClient, {testClock: true, method: 'payment_method'});

            // Attach a non default payment method
            const paymentMethod = await createPaymentMethod(stripe.debugClient, {
                customerId: customer.id,

                // Make sure these are different than the default, so we can find the card
                exp_month: 1,
                exp_year: 2029
            });
            const oldProduct = buildProduct({});

            const now = Math.floor(new Date().getTime() / 1000);
            const currentPeriodEnd = now + 15 * 24 * 60 * 60;
            const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

            const oldPrice = buildPrice({
                product: oldProduct,
                recurring: {
                    interval: 'month'
                }
            });

            const oldSubscription = buildSubscription({
                customer: customer.id,
                items: [
                    {
                        price: oldPrice
                    }
                ],
                current_period_start: currentPeriodStart,
                current_period_end: currentPeriodEnd,
                default_payment_method: {
                    ...paymentMethod,
                    // Change ids to break lookups (since these are from the old stripe account, and ids change here)
                    id: DryRunIdGenerator.getNext('pm_'),
                    card: {
                        ...paymentMethod.card!,
                        fingerprint: DryRunIdGenerator.getNext('fingerprint_')
                    }
                }
            });

            const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
            const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

            // Do some basic assertions
            assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
            assert.equal(newSubscription.status, 'active');
            assert.equal(newSubscription.start_date, oldSubscription.start_date);
            assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
            assert.equal(newSubscription.trial_end, null);
            assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
            assert.equal(newSubscription.customer, customer.id);
            assert.equal(newSubscription.description, oldSubscription.description);
            assert.equal(newSubscription.default_payment_method, paymentMethod.id);
            assert.equal(newSubscription.default_source, null);
            assert.equal(newSubscription.items.data.length, 1);
            assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
            assert.equal(newSubscription.items.data[0].quantity, 1);

            // Did not charge yet
            const newInvoices = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));
            assert.equal(newInvoices.data.length, 0);

            // Check upcoming invoice
            const upcomingInvoice = await stripe.use(client => client.invoices.retrieveUpcoming({
                customer: customer.id,
                subscription: newSubscription.id
            }));
            assert.equal(upcomingInvoice.amount_due, 100);
            assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);
            assert.ok(upcomingInvoice.lines.data[0].period.end >= oldSubscription.current_period_end + 27 * 24 * 60 * 60);
            assert.ok(upcomingInvoice.lines.data[0].period.end <= oldSubscription.current_period_end + 32 * 24 * 60 * 60);

            // Now wait for the period to end
            await advanceClock({
                clock,
                stripe: stripe.debugClient,
                time: currentPeriodEnd + 60 * 60
            });

            // Check one draft invoice has been created
            const newInvoicesAfter = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));
            assert.equal(newInvoicesAfter.data.length, 1);
            assert.equal(newInvoicesAfter.data[0].amount_due, 100);
            assert.equal(newInvoicesAfter.data[0].status, 'paid');
            assert.equal(newInvoicesAfter.data[0].amount_paid, 100);

            // Now confirm
            await subscriptionImporter.confirm(oldSubscription);

            // Wait one hour
            await advanceClock({
                clock,
                stripe: stripe.debugClient,
                time: currentPeriodEnd + 60 * 60 * 2
            });

            // Check no difference
            const newInvoicesAfterConfirm = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));

            assert.equal(newInvoicesAfterConfirm.data.length, 1);
            assert.equal(newInvoicesAfterConfirm.data[0].amount_due, 100);
            assert.equal(newInvoicesAfterConfirm.data[0].status, 'paid');
            assert.equal(newInvoicesAfterConfirm.data[0].amount_paid, 100);
        });

        test('Default source on subscription', async () => {
            // Customer with default source
            const {customer, clock} = await createValidCustomer(stripe.debugClient, {testClock: true, method: 'source'});

            // Attach a non default source
            const {source} = await createSource(stripe.debugClient, {
                customerId: customer.id,

                // Make sure these are different than the default, so we can find the card
                exp_month: 1,
                exp_year: 2029
            });
            const oldProduct = buildProduct({});

            const now = Math.floor(new Date().getTime() / 1000);
            const currentPeriodEnd = now + 15 * 24 * 60 * 60;
            const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

            const oldPrice = buildPrice({
                product: oldProduct,
                recurring: {
                    interval: 'month'
                }
            });

            const oldSubscription = buildSubscription({
                customer: customer.id,
                items: [
                    {
                        price: oldPrice
                    }
                ],
                current_period_start: currentPeriodStart,
                current_period_end: currentPeriodEnd,
                default_source: {
                    ...source,
                    // Change ids to break lookups (since these are from the old stripe account, and ids change here)
                    id: DryRunIdGenerator.getNext('src_')
                }
            });

            const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
            const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

            // Do some basic assertions
            assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
            assert.equal(newSubscription.status, 'active');
            assert.equal(newSubscription.start_date, oldSubscription.start_date);
            assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
            assert.equal(newSubscription.trial_end, null);
            assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
            assert.equal(newSubscription.customer, customer.id);
            assert.equal(newSubscription.description, oldSubscription.description);
            assert.equal(newSubscription.default_payment_method, null);
            assert.equal(newSubscription.default_source, source.id);
            assert.equal(newSubscription.items.data.length, 1);
            assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
            assert.equal(newSubscription.items.data[0].quantity, 1);

            // Did not charge yet
            const newInvoices = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));
            assert.equal(newInvoices.data.length, 0);

            // Check upcoming invoice
            const upcomingInvoice = await stripe.use(client => client.invoices.retrieveUpcoming({
                customer: customer.id,
                subscription: newSubscription.id
            }));
            assert.equal(upcomingInvoice.amount_due, 100);
            assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);
            assert.ok(upcomingInvoice.lines.data[0].period.end >= oldSubscription.current_period_end + 27 * 24 * 60 * 60);
            assert.ok(upcomingInvoice.lines.data[0].period.end <= oldSubscription.current_period_end + 32 * 24 * 60 * 60);

            // Now wait for the period to end
            await advanceClock({
                clock,
                stripe: stripe.debugClient,
                time: currentPeriodEnd + 60 * 60
            });

            // Check one draft invoice has been created
            const newInvoicesAfter = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));
            assert.equal(newInvoicesAfter.data.length, 1);
            assert.equal(newInvoicesAfter.data[0].amount_due, 100);
            assert.equal(newInvoicesAfter.data[0].status, 'paid');
            assert.equal(newInvoicesAfter.data[0].amount_paid, 100);

            // Now confirm
            await subscriptionImporter.confirm(oldSubscription);

            // Wait one hour
            await advanceClock({
                clock,
                stripe: stripe.debugClient,
                time: currentPeriodEnd + 60 * 60 * 2
            });

            // Check no difference
            const newInvoicesAfterConfirm = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));

            assert.equal(newInvoicesAfterConfirm.data.length, 1);
            assert.equal(newInvoicesAfterConfirm.data[0].amount_due, 100);
            assert.equal(newInvoicesAfterConfirm.data[0].status, 'paid');
            assert.equal(newInvoicesAfterConfirm.data[0].amount_paid, 100);
        });

        test('Default card source on subscription', async () => {
            // Stripe API supports to have a default_source of type Stripe.Card (instead of Stripe.Source). This is tested here.

            // Customer with default source
            const {customer, clock} = await createValidCustomer(stripe.debugClient, {testClock: true, method: 'source'});

            // Attach a non default source
            const {source, token} = await createSource(stripe.debugClient, {
                customerId: customer.id,

                // Make sure these are different than the default, so we can find the card
                exp_month: 1,
                exp_year: 2029
            });
            const card = token.card!;
            const oldProduct = buildProduct({});

            const now = Math.floor(new Date().getTime() / 1000);
            const currentPeriodEnd = now + 15 * 24 * 60 * 60;
            const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

            const oldPrice = buildPrice({
                product: oldProduct,
                recurring: {
                    interval: 'month'
                }
            });

            const oldSubscription = buildSubscription({
                customer: customer.id,
                items: [
                    {
                        price: oldPrice
                    }
                ],
                current_period_start: currentPeriodStart,
                current_period_end: currentPeriodEnd,
                default_source: {
                    // Card source
                    ...card,
                    id: DryRunIdGenerator.getNext('card_')
                }
            });

            const newSubscriptionId = await subscriptionImporter.recreateAndConfirm(oldSubscription);
            const newSubscription = await stripe.use(client => client.subscriptions.retrieve(newSubscriptionId));

            // Do some basic assertions
            assert.equal(newSubscription.metadata.ghost_migrate_id, oldSubscription.id);
            assert.equal(newSubscription.status, 'active');
            assert.equal(newSubscription.start_date, oldSubscription.start_date);
            assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
            assert.equal(newSubscription.trial_end, null);
            assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
            assert.equal(newSubscription.customer, customer.id);
            assert.equal(newSubscription.description, oldSubscription.description);
            assert.equal(newSubscription.default_payment_method, null);
            assert.equal(newSubscription.default_source, source.id);
            assert.equal(newSubscription.items.data.length, 1);
            assert.equal(newSubscription.items.data[0].price.metadata.ghost_migrate_id, oldPrice.id);
            assert.equal(newSubscription.items.data[0].quantity, 1);

            // Did not charge yet
            const newInvoices = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));
            assert.equal(newInvoices.data.length, 0);

            // Check upcoming invoice
            const upcomingInvoice = await stripe.use(client => client.invoices.retrieveUpcoming({
                customer: customer.id,
                subscription: newSubscription.id
            }));
            assert.equal(upcomingInvoice.amount_due, 100);
            assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);
            assert.ok(upcomingInvoice.lines.data[0].period.end >= oldSubscription.current_period_end + 27 * 24 * 60 * 60);
            assert.ok(upcomingInvoice.lines.data[0].period.end <= oldSubscription.current_period_end + 32 * 24 * 60 * 60);

            // Now wait for the period to end
            await advanceClock({
                clock,
                stripe: stripe.debugClient,
                time: currentPeriodEnd + 60 * 60
            });

            // Check one draft invoice has been created
            const newInvoicesAfter = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));
            assert.equal(newInvoicesAfter.data.length, 1);
            assert.equal(newInvoicesAfter.data[0].amount_due, 100);
            assert.equal(newInvoicesAfter.data[0].status, 'paid');
            assert.equal(newInvoicesAfter.data[0].amount_paid, 100);

            // Now confirm
            await subscriptionImporter.confirm(oldSubscription);

            // Wait one hour
            await advanceClock({
                clock,
                stripe: stripe.debugClient,
                time: currentPeriodEnd + 60 * 60 * 2
            });

            // Check no difference
            const newInvoicesAfterConfirm = await stripe.use(client => client.invoices.list({
                subscription: newSubscription.id
            }));

            assert.equal(newInvoicesAfterConfirm.data.length, 1);
            assert.equal(newInvoicesAfterConfirm.data[0].amount_due, 100);
            assert.equal(newInvoicesAfterConfirm.data[0].status, 'paid');
            assert.equal(newInvoicesAfterConfirm.data[0].amount_paid, 100);
        });
    });
});
