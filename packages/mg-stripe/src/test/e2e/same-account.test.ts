import assert from 'assert/strict';
import Stripe from 'stripe';
import {Options} from '../../lib/Options.js';
import {StripeAPI} from '../../lib/StripeAPI.js';
import {Reporter, ReportingCategory} from '../../lib/importers/Reporter.js';
import {createCouponImporter} from '../../lib/importers/createCouponImporter.js';
import {createPriceImporter} from '../../lib/importers/createPriceImporter.js';
import {createProductImporter} from '../../lib/importers/createProductImporter.js';
import {createSubscriptionImporter} from '../../lib/importers/createSubscriptionImporter.js';
import {buildCoupon, buildDiscount, buildPrice, buildProduct, buildSubscription, cleanup, createDeclinedCustomer, createValidCustomer, getStripeTestAPIKey} from './../utils/stripe.js';
import sinon from 'sinon';

const stripeTestApiKey = getStripeTestAPIKey();

describe('Recreating subscriptions', () => {
    const stripe = new StripeAPI({apiKey: stripeTestApiKey});
    const oldStripe = new StripeAPI({apiKey: stripeTestApiKey});

    let reporter: Reporter;
    let subscriptionImporter: ReturnType<typeof createSubscriptionImporter>;
    let validCustomer: Stripe.Customer;
    let declinedCustomer: Stripe.Customer;
    let currentInvoices: Stripe.Invoice[];

    // Helpers for creating initial data:
    let realProductImporter: ReturnType<typeof createProductImporter>;
    let realPriceImporter: ReturnType<typeof createPriceImporter>;
    let realCouponImporter: ReturnType<typeof createCouponImporter>;

    beforeAll(async () => {
        await stripe.validate();
        if (stripe.mode !== 'test') {
            throw new Error('Tests must run on a Stripe Account in test mode');
        }
        await oldStripe.validate();

        const {customer: vc} = await createValidCustomer(stripe.debugClient, {testClock: false});
        const {customer: dc} = await createDeclinedCustomer(stripe.debugClient, {testClock: false});

        validCustomer = vc;
        declinedCustomer = dc;

        sinon.stub(oldStripe.debugClient.invoices, 'list').callsFake(() => {
            return Promise.resolve({
                data: currentInvoices,
                object: 'list',
                has_more: false,
                url: ''
            }) as Stripe.ApiListPromise<Stripe.Invoice>;
        });

        sinon.stub(oldStripe.debugClient.subscriptions, 'update').callsFake(() => {
            return Promise.resolve({} as Stripe.Response<Stripe.Subscription>);
        });

        sinon.stub(oldStripe.debugClient.subscriptions, 'del').callsFake(() => {
            return Promise.resolve({} as Stripe.Response<Stripe.Subscription>);
        });
    });

    afterEach(async () => {
        await cleanup(stripe.debugClient);
    });

    beforeEach(async () => {
        reporter = new Reporter(new ReportingCategory(''));

        currentInvoices = [];
        const sharedOptions = {
            dryRun: false,
            oldStripe: oldStripe,
            newStripe: stripe,
            reporter
        };
        const delay = 1;

        Options.init({
            'force-recreate': true,
            'very-verbose': true,
            delay
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
            couponImporter,
            delay
        });

        // Real object importers from fake data -> actual stripe account
        const realSharedOptions = {
            dryRun: false,
            oldStripe: new StripeAPI({apiKey: ''}), // old is invalid to prevent usage
            newStripe: stripe,
            reporter
        };

        realProductImporter = createProductImporter({
            ...realSharedOptions
        });

        realPriceImporter = createPriceImporter({
            ...realSharedOptions,
            productImporter: realProductImporter
        });

        realCouponImporter = createCouponImporter({
            ...realSharedOptions
        });
    });

    it('Monthly subscription', async () => {
        const {customer} = await createValidCustomer(stripe.debugClient, {testClock: false});
        const fakeProduct = buildProduct({});

        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const fakePrice = buildPrice({
            product: fakeProduct,
            recurring: {
                interval: 'month'
            }
        });

        // Create the actual price in our stripe account
        const priceId = await realPriceImporter.recreate(fakePrice);
        const price = await stripe.debugClient.prices.retrieve(priceId);

        const oldSubscription = buildSubscription({
            customer: customer.id,
            items: [
                {
                    price: price
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

        // Same payment source used
        assert.equal(newSubscription.default_payment_method, oldSubscription.default_payment_method);
        assert.equal(newSubscription.default_source, oldSubscription.default_source);

        // Same customer
        assert.equal(newSubscription.customer, oldSubscription.customer);

        assert.equal(newSubscription.items.data.length, 1);

        // Same price id (no newly created one)
        assert.equal(newSubscription.items.data[0].price.id, priceId);
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
    });

    it('Yearly subscription', async () => {
        const {customer} = await createValidCustomer(stripe.debugClient, {testClock: false});
        const fakeProduct = buildProduct({});

        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 365 * 24 * 60 * 60;

        const fakePrice = buildPrice({
            product: fakeProduct,
            recurring: {
                interval: 'year'
            }
        });

        // Create the actual price in our stripe account
        const priceId = await realPriceImporter.recreate(fakePrice);
        const price = await stripe.debugClient.prices.retrieve(priceId);

        const oldSubscription = buildSubscription({
            customer: customer.id,
            items: [
                {
                    price: price
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

        // Same payment source used
        assert.equal(newSubscription.default_payment_method, oldSubscription.default_payment_method);
        assert.equal(newSubscription.default_source, oldSubscription.default_source);

        // Same customer
        assert.equal(newSubscription.customer, oldSubscription.customer);

        assert.equal(newSubscription.items.data.length, 1);

        // Same price id (no newly created one)
        assert.equal(newSubscription.items.data[0].price.id, priceId);
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
        assert.ok(upcomingInvoice.lines.data[0].period.end >= oldSubscription.current_period_end + 363 * 24 * 60 * 60);
        assert.ok(upcomingInvoice.lines.data[0].period.end <= oldSubscription.current_period_end + 367 * 24 * 60 * 60);
    });

    it('Multi-currency prices subscription', async () => {
        const {customer} = await createValidCustomer(stripe.debugClient, {testClock: false, currency: 'eur', method: 'source'});
        const fakeProduct = buildProduct({});

        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const fakePrice = buildPrice({
            product: fakeProduct,
            recurring: {
                interval: 'month'
            },
            currency_options: {
                eur: {
                    unit_amount: 100,
                    custom_unit_amount: null,
                    unit_amount_decimal: null,
                    tax_behavior: null
                }
            }
        });

        // Create the actual price in our stripe account
        const priceId = await realPriceImporter.recreate(fakePrice);
        const price = await stripe.debugClient.prices.retrieve(priceId);

        const oldSubscription = buildSubscription({
            customer: customer.id,
            items: [
                {
                    price: price
                }
            ],
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            currency: 'eur'
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
        assert.equal(newSubscription.currency, 'eur');

        // Same payment source used
        assert.equal(newSubscription.default_payment_method, oldSubscription.default_payment_method);
        assert.equal(newSubscription.default_source, oldSubscription.default_source);

        // Same customer
        assert.equal(newSubscription.customer, oldSubscription.customer);

        assert.equal(newSubscription.items.data.length, 1);

        // Same price id (no newly created one)
        assert.equal(newSubscription.items.data[0].price.id, priceId);
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
    });

    it('Subscription with a coupon', async () => {
        const {customer} = await createValidCustomer(stripe.debugClient, {testClock: false});
        const fakeProduct = buildProduct({});

        const now = Math.floor(new Date().getTime() / 1000);
        const currentPeriodEnd = now + 15 * 24 * 60 * 60;
        const currentPeriodStart = currentPeriodEnd - 31 * 24 * 60 * 60;

        const fakePrice = buildPrice({
            product: fakeProduct,
            recurring: {
                interval: 'month'
            }
        });

        const coupon = buildCoupon({
            duration: 'repeating',
            duration_in_months: 3,
            percent_off: 50
        });

        // Create the actual price in our stripe account
        const priceId = await realPriceImporter.recreate(fakePrice);
        const price = await stripe.debugClient.prices.retrieve(priceId);

        // Create the actual coupon in our stripe account
        const couponId = await realCouponImporter.recreate(coupon);
        const couponObj = await stripe.debugClient.coupons.retrieve(couponId);

        const oldSubscription = buildSubscription({
            customer: customer.id,
            items: [
                {
                    price: price
                }
            ],
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            discount: buildDiscount({
                coupon: couponObj
            })
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
        assert.ok(newSubscription.discount?.coupon);
        assert.equal(newSubscription.discount!.coupon!.percent_off, 50);
        assert.equal(newSubscription.customer, customer.id);
        assert.equal(newSubscription.description, oldSubscription.description);

        // Same payment source used
        assert.equal(newSubscription.default_payment_method, oldSubscription.default_payment_method);
        assert.equal(newSubscription.default_source, oldSubscription.default_source);

        // Same customer
        assert.equal(newSubscription.customer, oldSubscription.customer);

        assert.equal(newSubscription.items.data.length, 1);

        // Same price id (no newly created one)
        assert.equal(newSubscription.items.data[0].price.id, priceId);
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
        assert.equal(upcomingInvoice.amount_due, 50); // Discount has been applied to the upcoming invoice
        assert.equal(upcomingInvoice.lines.data[0].period.start, oldSubscription.current_period_end);
        assert.ok(upcomingInvoice.lines.data[0].period.end >= oldSubscription.current_period_end + 27 * 24 * 60 * 60);
        assert.ok(upcomingInvoice.lines.data[0].period.end <= oldSubscription.current_period_end + 32 * 24 * 60 * 60);
    });

    it.todo('Test with a trial period');
});
