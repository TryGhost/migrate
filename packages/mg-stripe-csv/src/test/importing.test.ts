import Stripe from 'stripe';
import {StripeAPI} from '../lib/StripeAPI.js';
import {ImportStats} from '../lib/importers/ImportStats.js';
import {createCouponImporter} from '../lib/importers/createCouponImporter.js';
import {createPriceImporter} from '../lib/importers/createPriceImporter.js';
import {createProductImporter} from '../lib/importers/createProductImporter.js';
import {createSubscriptionImporter} from '../lib/importers/createSubscriptionImporter.js';
import {buildPrice, buildProduct, buildSubscription, createValidCustomer, getStripeTestAPIKey} from './utils/stripe.js';
import {Options} from '../lib/Options.js';
import assert from 'assert/strict';

const stripeTestApiKey = getStripeTestAPIKey();

describe('test', () => {
    const stripe = new StripeAPI({apiKey: stripeTestApiKey});
    let stats: ImportStats;
    let subscriptionImporter: ReturnType<typeof createSubscriptionImporter>;
    let validCustomer: Stripe.Customer;

    beforeEach(async () => {
        stats = new ImportStats();
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

        // Create a valid customer
        validCustomer = await createValidCustomer(stripe.client);
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
    });

    it.only('Subsciption that renews today', async () => {
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

        // Check current period end is extended by ±30 days
        assert.ok(newSubscription.current_period_end > oldSubscription.current_period_end + 29 * 24 * 60 * 60);
        assert.ok(newSubscription.current_period_end < oldSubscription.current_period_end + 32 * 24 * 60 * 60);

        assert.equal(newSubscription.trial_end, oldSubscription.trial_end);
        assert.equal(newSubscription.cancel_at_period_end, oldSubscription.cancel_at_period_end);
        assert.equal(newSubscription.customer, validCustomer.id);
        assert.equal(newSubscription.description, oldSubscription.description);
        assert.equal(newSubscription.default_payment_method, validCustomer.invoice_settings.default_payment_method);
        assert.equal(newSubscription.items.data.length, 1);
        assert.equal(newSubscription.items.data[0].price.metadata.importOldId, oldPrice.id);
        assert.equal(newSubscription.items.data[0].quantity, 1);
    });
});
