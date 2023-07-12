import Stripe from 'stripe';
import {StripeAPI} from '../lib/StripeAPI.js';
import {ImportStats} from '../lib/importers/ImportStats.js';
import {createCouponImporter} from '../lib/importers/createCouponImporter.js';
import {createPriceImporter} from '../lib/importers/createPriceImporter.js';
import {createProductImporter} from '../lib/importers/createProductImporter.js';
import {createSubscriptionImporter} from '../lib/importers/createSubscriptionImporter.js';
import {buildPrice, buildProduct, buildSubscription, createDeclinedCustomer, createValidCustomer, getStripeTestAPIKey} from './utils/stripe.js';
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
    });

    it('Subsciption that renews today and will be declined', async () => {
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

        // The whole point of Past Due invoices is that they have an open invoice that is not yet paid
        // So to simulate this, we need to also generate and pass in the open invoice
        const invoiceItem: Stripe.InvoiceLineItem = {
            id: 'ii_1',
            amount: 1000,
            object: 'line_item',
            amount_excluding_tax: null,
            currency: 'usd',
            description: null,
            discount_amounts: null,
            discountable: false,
            discounts: null,
            livemode: false,
            metadata: {},
            period: {
                start: now - 15 * 24 * 60 * 60,
                end: now + 15 * 24 * 60 * 60
            },
            plan: null,
            price: oldPrice,
            proration: false,
            proration_details: null,
            quantity: 1,
            subscription: null,
            type: 'subscription',
            unit_amount_excluding_tax: null
        };

        const invoice: Stripe.Invoice = {
            id: 'in_1',
            object: 'invoice',
            account_country: null,
            account_name: null,
            account_tax_ids: null,
            amount_due: 0,
            amount_paid: 0,
            amount_remaining: 0,
            amount_shipping: 0,
            application: null,
            application_fee_amount: null,
            attempt_count: 0,
            attempted: false,
            automatic_tax: {
                enabled: false,
                status: null
            },
            billing_reason: null,
            charge: null,
            collection_method: 'charge_automatically',
            created: 0,
            currency: '',
            custom_fields: null,
            customer: null,
            customer_address: null,
            customer_email: null,
            customer_name: null,
            customer_phone: null,
            customer_shipping: null,
            customer_tax_exempt: null,
            default_payment_method: null,
            default_source: null,
            default_tax_rates: [],
            description: null,
            discount: null,
            discounts: null,
            due_date: null,
            effective_at: null,
            ending_balance: null,
            footer: null,
            from_invoice: null,
            last_finalization_error: null,
            latest_revision: null,
            lines: {
                object: 'list',
                data: [
                    invoiceItem
                ],
                has_more: false,
                url: ''
            },
            livemode: false,
            metadata: null,
            next_payment_attempt: null,
            number: null,
            on_behalf_of: null,
            paid: false,
            paid_out_of_band: false,
            payment_intent: null,
            payment_settings: {} as any,
            period_end: 0,
            period_start: 0,
            post_payment_credit_notes_amount: 0,
            pre_payment_credit_notes_amount: 0,
            quote: null,
            receipt_number: null,
            rendering_options: null,
            shipping_cost: null,
            shipping_details: null,
            starting_balance: 0,
            statement_descriptor: null,
            status: 'open',
            status_transitions: {} as any,
            subscription: null,
            subtotal: 0,
            subtotal_excluding_tax: null,
            tax: null,
            test_clock: null,
            total: 0,
            total_discount_amounts: null,
            total_excluding_tax: null,
            total_tax_amounts: [],
            transfer_data: null,
            webhooks_delivered_at: null
        };

        // Return these invoices when we ask Stripe
        currentInvoices = [invoice];

        const oldSubscription: Stripe.Subscription = buildSubscription({
            status: 'past_due',
            customer: declinedCustomer.id,
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
        assert.equal(newInvoices.data[0].amount_due, 1000);
        assert.equal(newInvoices.data[0].customer, declinedCustomer.id);
    });
});
