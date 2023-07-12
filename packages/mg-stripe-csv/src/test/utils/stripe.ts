import 'dotenv/config';
import Stripe from 'stripe';
import DryRunIdGenerator from '../../lib/DryRunIdGenerator.js';

/**
 * Clear all stripe data of a given account
 */
function clearStripe() {

}

export function getStripeTestAPIKey() {
    if (!process.env.STRIPE_API_KEY) {
        throw new Error('Missing env variable STRIPE_API_KEY. Please create .env file in the root of the project and add STRIPE_API_KEY=xxx');
    }

    return process.env.STRIPE_API_KEY;
}

export async function createValidCustomer(stripe: Stripe) {
    let customer = await stripe.customers.create({
        name: 'Valid Customer',
        email: ''
    });

    const paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: {
            number: '4242424242424242',
            exp_month: 4,
            exp_year: 2028,
            cvc: '314'
        }
    });

    await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: customer.id
    });

    // Set as default payment method
    customer = await stripe.customers.update(customer.id, {
        invoice_settings: {
            default_payment_method: paymentMethod.id
        }
    });

    return customer;
}

export async function createDeclinedCustomer(stripe: Stripe) {
    let customer = await stripe.customers.create({
        name: 'Declined Customer',
        email: ''
    });

    const paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: {
            number: '4000000000000341',
            exp_month: 4,
            exp_year: 2028,
            cvc: '314'
        }
    });

    await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: customer.id
    });

    // Set as default payment method
    customer = await stripe.customers.update(customer.id, {
        invoice_settings: {
            default_payment_method: paymentMethod.id
        }
    });

    return customer;
}

/**
 * Build an in memory product that doesn't exist in Stripe
 */
export function buildProduct(overrides: Partial<Stripe.Product>): Stripe.Product {
    return {
        id: DryRunIdGenerator.getNext('prod_'),
        object: 'product',
        active: true,
        attributes: null,
        created: 0,
        description: null,
        images: [],
        livemode: false,
        metadata: {},
        name: 'Monthly Subscription',
        package_dimensions: null,
        shippable: null,
        tax_code: null,
        type: 'good',
        updated: 0,
        url: null,
        ...overrides
    };
}

export function buildPrice(overrides: Partial<Omit<Stripe.Price, 'recurring'>> & {recurring: Partial<Stripe.Price.Recurring>} & {product: Stripe.Product | string}): Stripe.Price {
    return {
        id: DryRunIdGenerator.getNext('price_'),
        active: true,
        currency: 'usd',
        unit_amount: 100,
        created: 123,
        billing_scheme: 'per_unit',
        livemode: false,
        custom_unit_amount: null,
        tiers_mode: null,
        tax_behavior: null,
        object: 'price',
        lookup_key: null,
        nickname: null,
        transform_quantity: null,
        type: 'recurring',
        unit_amount_decimal: '100',
        metadata: {},
        ...overrides,
        recurring: {
            interval: 'month',
            interval_count: 1,
            aggregate_usage: null,
            trial_period_days: null,
            usage_type: 'licensed',
            ...overrides.recurring
        }
    };
}

const DAY = 24 * 60 * 60;
export function buildSubscription(overrides: Partial<Omit<Stripe.Subscription, 'items' | 'customer'>> & {items: {price: Stripe.Price}[], customer: string}): Stripe.Subscription {
    const id = DryRunIdGenerator.getNext('sub_');
    const items: Stripe.SubscriptionItem[] = overrides.items.map((item) => {
        return {
            id: DryRunIdGenerator.getNext('si_'),
            object: 'subscription_item',
            billing_thresholds: null,
            created: 123,
            metadata: {},
            plan: {} as Stripe.Plan,
            subscription: id,
            tax_rates: [],
            price: item.price
        };
    });
    const now = Math.floor(new Date().getTime() / 1000);
    return {
        id,
        object: 'subscription',
        application: null,
        application_fee_percent: null,
        automatic_tax: {enabled: false},
        billing_cycle_anchor: 0,
        billing_thresholds: null,
        cancel_at: null,
        cancel_at_period_end: false,
        canceled_at: null,
        cancellation_details: null,
        collection_method: 'charge_automatically',
        created: now - DAY * 45,
        currency: '',
        current_period_end: now + DAY * 15,
        current_period_start: now - DAY * 15,
        days_until_due: null,
        default_payment_method: null,
        default_source: null,
        description: null,
        discount: null,
        ended_at: null,
        latest_invoice: null,
        livemode: false,
        metadata: {},
        next_pending_invoice_item_invoice: null,
        on_behalf_of: null,
        pause_collection: null,
        payment_settings: null,
        pending_invoice_item_interval: null,
        pending_setup_intent: null,
        pending_update: null,
        schedule: null,
        start_date: now - DAY * 45,
        status: 'active',
        test_clock: null,
        transfer_data: null,
        trial_end: null,
        trial_settings: null,
        trial_start: null,
        ...overrides,
        items: {
            object: 'list',
            has_more: false,
            url: '',
            data: items
        }
    };
}
