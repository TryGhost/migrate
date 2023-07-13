import Stripe from 'stripe';
import {StripeAPI} from '../lib/StripeAPI.js';
import {ImportStats} from '../lib/importers/ImportStats.js';
import {createCouponImporter} from '../lib/importers/createCouponImporter.js';
import {createPriceImporter} from '../lib/importers/createPriceImporter.js';
import {createProductImporter} from '../lib/importers/createProductImporter.js';
import {createSubscriptionImporter} from '../lib/importers/createSubscriptionImporter.js';
import {buildInvoice, buildPrice, buildProduct, buildSubscription, createDeclinedCustomer, createValidCustomer, getStripeTestAPIKey} from './utils/stripe.js';
import {Options} from '../lib/Options.js';
import assert from 'assert/strict';
import sinon from 'sinon';

const stripeTestApiKey = getStripeTestAPIKey();

describe('test', () => {
    const stripe = new StripeAPI({apiKey: stripeTestApiKey});
    let stats: ImportStats;
    let subscriptionImporter: ReturnType<typeof createSubscriptionImporter>;
    let validCustomer: Stripe.Customer;
    let declinedCustomer: Stripe.Customer;
    let currentInvoices: Stripe.Invoice[];

    beforeAll(async () => {
        validCustomer = await createValidCustomer(stripe.client);
        declinedCustomer = await createDeclinedCustomer(stripe.client);
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

    it('Basic migration', async () => {
        const oldProduct: Stripe.Product = buildProduct({});

        const oldPrice: Stripe.Price = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription: Stripe.Subscription = buildSubscription({
            customer: validCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ]
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
    });

    it('Trial subscriptions', async () => {
        const oldProduct: Stripe.Product = buildProduct({});

        const oldPrice: Stripe.Price = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription: Stripe.Subscription = buildSubscription({
            customer: validCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ]
        });
        oldSubscription.trial_end = oldSubscription.current_period_end;

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

    it('Subsciption that renews today', async () => {
        const oldProduct: Stripe.Product = buildProduct({});

        const oldPrice: Stripe.Price = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription: Stripe.Subscription = buildSubscription({
            customer: validCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_end: Math.ceil(Date.now() / 1000)
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
        const oldProduct: Stripe.Product = buildProduct({});

        const oldPrice: Stripe.Price = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });

        const oldSubscription: Stripe.Subscription = buildSubscription({
            customer: declinedCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ],
            current_period_end: Math.ceil(Date.now() / 1000)
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
        const oldProduct: Stripe.Product = buildProduct({});

        const oldPrice: Stripe.Price = buildPrice({
            product: oldProduct,
            recurring: {
                interval: 'month'
            }
        });
        const now = Math.floor(new Date().getTime() / 1000);

        const oldSubscription: Stripe.Subscription = buildSubscription({
            status: 'past_due',
            customer: declinedCustomer.id,
            items: [
                {
                    price: oldPrice
                }
            ]
        });

        const invoice: Stripe.Invoice = buildInvoice({
            customer: declinedCustomer.id,
            subscription: oldSubscription.id,
            lines: [
                {
                    price: oldPrice,
                    period: {
                        start: now - 15 * 24 * 60 * 60,
                        end: now + 15 * 24 * 60 * 60
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
        assert.equal(newSubscription.customer, declinedCustomer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, declinedCustomer.invoice_settings.default_payment_method);
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
        assert.equal(newInvoices.data[0].customer, declinedCustomer.id);

        // Check upcoming invoice
        const upcomingInvoice = await stripe.client.invoices.retrieveUpcoming({
            customer: declinedCustomer.id,
            subscription: newSubscription.id
        });
        assert.equal(upcomingInvoice.amount_due, 100);
        assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);
    });
});
