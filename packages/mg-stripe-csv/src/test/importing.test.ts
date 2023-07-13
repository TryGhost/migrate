import Stripe from 'stripe';
import {StripeAPI} from '../lib/StripeAPI.js';
import {ImportStats} from '../lib/importers/ImportStats.js';
import {createCouponImporter} from '../lib/importers/createCouponImporter.js';
import {createPriceImporter} from '../lib/importers/createPriceImporter.js';
import {createProductImporter} from '../lib/importers/createProductImporter.js';
import {createSubscriptionImporter} from '../lib/importers/createSubscriptionImporter.js';
import {advanceClock, buildInvoice, buildPrice, buildProduct, buildSubscription, createDeclinedCustomer, createValidCustomer, getStripeTestAPIKey} from './utils/stripe.js';
import {Options} from '../lib/Options.js';
import assert from 'assert/strict';
import sinon from 'sinon';
import {isWarning} from '../lib/helpers.js';

const stripeTestApiKey = getStripeTestAPIKey();

describe('Recreating subscriptions', () => {
    const stripe = new StripeAPI({apiKey: stripeTestApiKey});
    let stats: ImportStats;
    let subscriptionImporter: ReturnType<typeof createSubscriptionImporter>;
    let validCustomer: Stripe.Customer;
    let declinedCustomer: Stripe.Customer;
    let currentInvoices: Stripe.Invoice[];

    beforeAll(async () => {
        const {customer: vc} = await createValidCustomer(stripe.client, {testClock: false});
        const {customer: dc} = await createDeclinedCustomer(stripe.client, {testClock: false});

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
            'force-recreate': true
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

        sinon.stub(sharedOptions.oldStripe.client.invoices, 'list').callsFake(() => {
            return Promise.resolve({
                data: currentInvoices,
                object: 'list',
                has_more: false,
                url: ''
            }) as Stripe.ApiListPromise<Stripe.Invoice>;
        });
    });

    it('Monthly subscription', async () => {
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
            customer: validCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd
        });

        const newSubscriptionId = await subscriptionImporter.recreate(oldSubscription);
        const newSubscription = await stripe.client.subscriptions.retrieve(newSubscriptionId);

        // Do some basic assertions
        assert.equal(newSubscription.metadata.importOldId, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
        assert.equal(newSubscription.trial_end, null);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, validCustomer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, validCustomer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.importOldId, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.client.invoices.list({
            subscription: newSubscription.id
        });
        assert.equal(newInvoices.data.length, 0);

        // Check upcoming invoice
        const upcomingInvoice = await stripe.client.invoices.retrieveUpcoming({
            customer: validCustomer.id,
            subscription: newSubscription.id
        });
        assert.equal(upcomingInvoice.amount_due, 100);
        assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);
        assert.ok(upcomingInvoice.lines.data[0].period.end >= oldSubscription.current_period_end + 27 * 24 * 60 * 60);
        assert.ok(upcomingInvoice.lines.data[0].period.end <= oldSubscription.current_period_end + 32 * 24 * 60 * 60);
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

        const newSubscriptionId = await subscriptionImporter.recreate(oldSubscription);
        const newSubscription = await stripe.client.subscriptions.retrieve(newSubscriptionId);

        // Do some basic assertions
        assert.equal(newSubscription.metadata.importOldId, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
        assert.equal(newSubscription.trial_end, null);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, validCustomer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, validCustomer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.importOldId, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.client.invoices.list({
            subscription: newSubscription.id
        });
        assert.equal(newInvoices.data.length, 0);

        // Check upcoming invoice
        const upcomingInvoice = await stripe.client.invoices.retrieveUpcoming({
            customer: validCustomer.id,
            subscription: newSubscription.id
        });
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

        const newSubscriptionId = await subscriptionImporter.recreate(oldSubscription);
        const newSubscription = await stripe.client.subscriptions.retrieve(newSubscriptionId);

        // Do some basic assertions
        assert.equal(newSubscription.metadata.importOldId, oldSubscription.id);
        assert.equal(newSubscription.status, 'trialing');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
        assert.equal(newSubscription.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, validCustomer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, validCustomer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.importOldId, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.client.invoices.list({
            subscription: newSubscription.id
        });
        assert.equal(newInvoices.data.length, 1);
        assert.equal(newInvoices.data[0].status, 'paid');
        assert.equal(newInvoices.data[0].amount_due, 0);
        assert.equal(newInvoices.data[0].amount_paid, 0);
        assert.equal(newInvoices.data[0].lines.data[0].period.end, oldSubscription.current_period_end);
        assert.equal(newInvoices.data[0].lines.data[0].period.start, oldSubscription.start_date);
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

        const newSubscriptionId = await subscriptionImporter.recreate(oldSubscription);
        const newSubscription = await stripe.client.subscriptions.retrieve(newSubscriptionId);

        // Do some basic assertions
        assert.equal(newSubscription.metadata.importOldId, oldSubscription.id);
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
        assert.equal(newSubscription.items.data[0].price.metadata.importOldId, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.client.invoices.list({
            subscription: newSubscription.id
        });
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

        const newSubscriptionId = await subscriptionImporter.recreate(oldSubscription);
        const newSubscription = await stripe.client.subscriptions.retrieve(newSubscriptionId);

        // Do some basic assertions
        assert.equal(newSubscription.metadata.importOldId, oldSubscription.id);
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
        assert.equal(newSubscription.items.data[0].price.metadata.importOldId, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Did not charge yet
        const newInvoices = await stripe.client.invoices.list({
            subscription: newSubscription.id
        });
        assert.equal(newInvoices.data.length, 0);
    });

    it('Past Due Subscription', async () => {
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 17 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const {customer, clock} = await createDeclinedCustomer(stripe.client, {testClock: true});

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

        const newSubscriptionId = await subscriptionImporter.recreate(oldSubscription);
        const newSubscription = await stripe.client.subscriptions.retrieve(newSubscriptionId);

        // Do some basic assertions
        assert.equal(newSubscription.metadata.importOldId, oldSubscription.id);
        assert.equal(newSubscription.status, 'past_due');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, oldSubscription.current_period_end);
        assert.equal(newSubscription.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, customer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, customer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.importOldId, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Check created invoices from the subscription
        const newInvoices = await stripe.client.invoices.list({
            subscription: newSubscription.id
        });
        assert.equal(newInvoices.data.length, 1);
        assert.equal(newInvoices.data[0].status, 'open');
        assert.equal(newInvoices.data[0].attempt_count, 1);
        assert.equal(newInvoices.data[0].amount_due, 100);
        assert.equal(newInvoices.data[0].customer, customer.id);

        // Check upcoming invoice
        const upcomingInvoice = await stripe.client.invoices.retrieveUpcoming({
            customer: customer.id,
            subscription: newSubscription.id
        });
        assert.equal(upcomingInvoice.amount_due, 100);
        assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);

        // Advance time until current period end
        await advanceClock({
            clock,
            stripe: stripe.client,
            time: oldSubscription.current_period_end - 60 * 60
        });

        // Should be canceled now (depends on account settings!)
        // If this fails the test, check if your stripe account is setup to cancel subscriptions if they fail too many times
        const newSubscriptionAfterDue = await stripe.client.subscriptions.retrieve(newSubscriptionId);
        assert.equal(newSubscriptionAfterDue.status, 'canceled');

        // Check no other invoices were created
        const newInvoicesAfterDue = await stripe.client.invoices.list({
            subscription: newSubscription.id
        });
        assert.equal(newInvoicesAfterDue.data.length, 1);
    });

    it('Subscriptions that were canceled (at period end)', async () => {
        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const {customer, clock} = await createValidCustomer(stripe.client, {testClock: true});

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

        const newSubscriptionId = await subscriptionImporter.recreate(oldSubscription);
        const newSubscription = await stripe.client.subscriptions.retrieve(newSubscriptionId);

        // Do some basic assertions
        assert.equal(newSubscription.metadata.importOldId, oldSubscription.id);
        assert.equal(newSubscription.status, 'active');
        assert.equal(newSubscription.start_date, oldSubscription.start_date);
        assert.equal(newSubscription.current_period_end, currentPeriodEnd);
        assert.equal(newSubscription.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscription.cancel_at_period_end, true);
        assert.equal(newSubscription.customer, customer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, customer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.importOldId, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);

        // Check did not create invoices from the subscription
        const newInvoices = await stripe.client.invoices.list({
            subscription: newSubscription.id
        });
        assert.equal(newInvoices.data.length, 0);

        // Check no upcoming invoice
        await assert.rejects(stripe.client.invoices.retrieveUpcoming({
            customer: customer.id,
            subscription: newSubscription.id
        }), /No upcoming invoices for customer/);

        // Advance time until current period end
        await advanceClock({
            clock,
            stripe: stripe.client,
            time: currentPeriodEnd + 10
        });

        // Should be canceled now
        const newSubscriptionAfterDue = await stripe.client.subscriptions.retrieve(newSubscriptionId);
        assert.equal(newSubscriptionAfterDue.status, 'canceled');

        // Check no other invoices were created
        const newInvoicesAfterDue = await stripe.client.invoices.list({
            subscription: newSubscription.id
        });
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

        await assert.rejects(subscriptionImporter.recreate(oldSubscription), (thrown) => {
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

        await assert.rejects(subscriptionImporter.recreate(oldSubscription), (thrown) => {
            return isWarning(thrown) && !!thrown.toString().match(/has a status of unpaid/);
        });
    });
});
