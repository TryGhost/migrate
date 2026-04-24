import 'dotenv/config';
import Stripe from 'stripe';
import DryRunIdGenerator from '../../lib/DryRunIdGenerator.js';

export function getStripeTestAPIKey() {
    if (!process.env.STRIPE_API_KEY) {
        throw new Error('Missing env variable STRIPE_API_KEY. Please create .env file in the root of the project and add STRIPE_API_KEY=xxx');
    }

    return process.env.STRIPE_API_KEY;
}

export async function cleanup(stripe: Stripe) {
    for await (const c of stripe.testHelpers.testClocks.list({limit: 100})) {
        // Advance time until current period end
        try {
            await stripe.testHelpers.testClocks.del(c.id);
        } catch (e) {
            // Ignore
        }
    }
}

export async function advanceClock({clock, stripe, time}: {clock: string, stripe: Stripe, time: number}) {
    // Advance time until current period end
    let c = await stripe.testHelpers.testClocks.advance(clock!, {
        frozen_time: time
    });

    // Poll clock until testClock is settled
    while (c.status === 'advancing') {
        await new Promise((resolve) => {
            setTimeout(resolve, 200);
        });
        c = await stripe.testHelpers.testClocks.retrieve(clock!);
    }
}

export async function createPaymentMethod(stripe: Stripe, options: {card: string, customerId: string}): Promise<Stripe.PaymentMethod> {
    const paymentMethod = await stripe.paymentMethods.retrieve(options.card);

    await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: options.customerId
    });

    return paymentMethod;
}

export async function createSource(stripe: Stripe, options: {token: string, customerId: string, currency?: string}): Promise<{source: Stripe.Source, card?: Stripe.Card}> {
    const source = await stripe.sources.create({
        type: 'card',
        token: options.token,
        usage: 'reusable',
        currency: options.currency
    });

    await stripe.customers.createSource(options.customerId, {
        source: source.id
    });

    // Important here is that we need to return token.card, because that contains the card source object. Source.card is not the right type
    const token = await stripe.tokens.retrieve(options.token);
    return {source, card: token.card};
}

export async function createValidCustomer<T extends boolean>(stripe: Stripe, options: {method?: 'source' | 'payment_method' | 'none', paymentMethod?: string, token?: string, name?: string, currency?: string, testClock?: T} = {}): Promise<{customer: Stripe.Customer, clock: T extends true ? string : undefined}> {
    let clockId: string | null = null;
    if (options.testClock) {
        const clock = await stripe.testHelpers.testClocks.create({
            frozen_time: Math.floor(Date.now() / 1000),
            name: 'E2E tests'
        });
        clockId = clock.id;
    }

    let customer = await stripe.customers.create({
        name: options.name ?? 'Valid Customer',
        email: '',
        test_clock: clockId ?? undefined
    });

    if (options.method === undefined || options.method === 'payment_method') {
        const paymentMethod = await createPaymentMethod(stripe, {
            customerId: customer.id,
            card: options.paymentMethod ?? 'pm_card_visa'
        });

        // Set as default payment method
        customer = await stripe.customers.update(customer.id, {
            invoice_settings: {
                default_payment_method: paymentMethod.id
            }
        });
    }

    if (options.method === 'source') {
        const {source} = await createSource(stripe, {
            customerId: customer.id,
            token: options.token ?? 'tok_visa',
            currency: options.currency
        });

        // Set as default source
        customer = await stripe.customers.update(customer.id, {
            default_source: source.id
        });
    }

    return {customer, clock: clockId as any};
}

export async function createDeclinedCustomer<T extends boolean>(stripe: Stripe, options: {testClock?: T} = {}): Promise<{customer: Stripe.Customer, clock: T extends true ? string : undefined}> {
    return createValidCustomer(stripe, {
        paymentMethod: 'pm_card_chargeCustomerFail',
        name: 'Declined Customer',
        testClock: options.testClock
    });
}

export function buildDiscount(overrides: Partial<Omit<Stripe.Discount, 'source'>> & {coupon: Stripe.Coupon}): Stripe.Discount {
    const {coupon, ...rest} = overrides;
    return {
        id: DryRunIdGenerator.getNext('di_'),
        object: 'discount',
        customer: null,
        customer_account: null,
        end: null,
        invoice: null,
        invoice_item: null,
        promotion_code: null,
        start: 0,
        checkout_session: null,
        subscription: null,
        subscription_item: null,
        ...rest,
        source: {
            coupon,
            type: 'coupon' as const
        }
    };
}

export function buildCoupon(overrides: Partial<Stripe.Coupon>): Stripe.Coupon {
    return {
        id: DryRunIdGenerator.getUnique('coupon_'), // needs to be unique
        object: 'coupon',
        amount_off: null,
        created: 0,
        currency: null,
        duration: 'once',
        duration_in_months: null,
        livemode: false,
        max_redemptions: null,
        metadata: {},
        name: 'Test Coupon',
        percent_off: 10,
        redeem_by: null,
        times_redeemed: 0,
        valid: true,
        ...overrides
    };
}

/**
 * Build an in memory product that doesn't exist in Stripe
 */
export function buildProduct(overrides: Partial<Stripe.Product>): Stripe.Product {
    return {
        id: DryRunIdGenerator.getNext('prod_'),
        object: 'product',
        active: true,
        created: 0,
        description: null,
        images: [],
        livemode: false,
        marketing_features: [],
        metadata: {},
        name: 'Test Product',
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
        unit_amount_decimal: Stripe.Decimal.from('100'),
        metadata: {},
        ...overrides,
        recurring: {
            interval: 'month',
            interval_count: 1,
            meter: null,
            trial_period_days: null,
            usage_type: 'licensed',
            ...overrides.recurring
        }
    };
}

const DAY = 24 * 60 * 60;
export function buildSubscription(overrides: Partial<Omit<Stripe.Subscription, 'items' | 'customer'>> & {items: {price: Stripe.Price}[], customer: string, current_period_start?: number, current_period_end?: number}): Stripe.Subscription {
    const id = DryRunIdGenerator.getNext('sub_');
    const now = Math.floor(new Date().getTime() / 1000);
    const currentPeriodStart = overrides.current_period_start ?? now - DAY * 15;
    const currentPeriodEnd = overrides.current_period_end ?? now + DAY * 15;
    const items: Stripe.SubscriptionItem[] = overrides.items.map((item) => {
        return {
            id: DryRunIdGenerator.getNext('si_'),
            object: 'subscription_item',
            billing_thresholds: null,
            created: 123,
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            discounts: [],
            metadata: {},
            plan: {} as Stripe.Plan,
            subscription: id,
            tax_rates: [],
            price: item.price,
            quantity: 1
        };
    });
    const {current_period_start: _cps, current_period_end: _cpe, ...restOverrides} = overrides;
    return {
        id,
        object: 'subscription',
        application: null,
        application_fee_percent: null,
        automatic_tax: {disabled_reason: null, enabled: false, liability: null},
        billing_cycle_anchor: 0,
        billing_cycle_anchor_config: null,
        billing_mode: {flexible: null, type: 'classic'},
        billing_thresholds: null,
        cancel_at: null,
        cancel_at_period_end: false,
        canceled_at: null,
        customer_account: null,
        cancellation_details: null,
        collection_method: 'charge_automatically',
        created: now - DAY * 45,
        currency: 'usd',
        days_until_due: null,
        default_payment_method: null,
        default_source: null,
        description: null,
        discounts: [],
        ended_at: null,
        invoice_settings: {account_tax_ids: null, issuer: {type: 'self'}},
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
        ...restOverrides,
        items: {
            object: 'list',
            has_more: false,
            url: '',
            data: items
        }
    };
}

export function buildInvoiceItem(data: {price: Stripe.Price, period: Stripe.InvoiceLineItem.Period}): Stripe.InvoiceLineItem {
    const product = typeof data.price.product === 'string' ? data.price.product : data.price.product.id;
    const invoiceItem: Stripe.InvoiceLineItem = {
        id: DryRunIdGenerator.getNext('ii_'),
        amount: data.price.unit_amount!,
        currency: 'usd',
        description: null,
        discountable: false,
        discounts: [],
        discount_amounts: null,
        invoice: null,
        livemode: false,
        metadata: {},
        parent: null,
        period: data.period,
        pretax_credit_amounts: null,
        pricing: {
            price_details: {
                price: data.price,
                product
            },
            type: 'price_details',
            unit_amount_decimal: data.price.unit_amount_decimal ?? null
        },
        quantity: 1,
        quantity_decimal: null,
        subscription: null,
        subtotal: data.price.unit_amount!,
        taxes: null,
        object: 'line_item'
    };
    return invoiceItem;
}

export function buildInvoice(overrides: Partial<Omit<Stripe.Invoice, 'lines' | 'customer'>> & {lines: {price: Stripe.Price, period: Stripe.InvoiceLineItem.Period}[], customer: string, subscription: string}): Stripe.Invoice {
    const id = DryRunIdGenerator.getNext('in_');
    return {
        id,
        object: 'invoice',
        account_country: null,
        account_name: null,
        account_tax_ids: null,
        amount_due: 0,
        amount_overpaid: 0,
        amount_paid: 0,
        amount_remaining: 0,
        amount_shipping: 0,
        application: null,
        attempt_count: 0,
        attempted: false,
        automatic_tax: {
            disabled_reason: null,
            enabled: false,
            liability: null,
            provider: null,
            status: null
        },
        automatically_finalizes_at: null,
        billing_reason: null,
        collection_method: 'charge_automatically',
        created: 0,
        currency: '',
        custom_fields: null,
        customer_account: null,
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
        discounts: [],
        due_date: null,
        effective_at: null,
        ending_balance: null,
        footer: null,
        from_invoice: null,
        issuer: {type: 'self'},
        last_finalization_error: null,
        latest_revision: null,
        livemode: false,
        metadata: null,
        next_payment_attempt: null,
        number: null,
        on_behalf_of: null,
        parent: null,
        payment_settings: {} as any,
        period_end: 0,
        period_start: 0,
        post_payment_credit_notes_amount: 0,
        pre_payment_credit_notes_amount: 0,
        receipt_number: null,
        rendering: null,
        shipping_cost: null,
        shipping_details: null,
        starting_balance: 0,
        statement_descriptor: null,
        status: 'open',
        status_transitions: {} as any,
        subtotal: 0,
        subtotal_excluding_tax: null,
        test_clock: null,
        total: 0,
        total_discount_amounts: null,
        total_excluding_tax: null,
        total_pretax_credit_amounts: null,
        total_taxes: null,
        webhooks_delivered_at: null,
        ...overrides,
        lines: {
            object: 'list',
            data: [
                buildInvoiceItem({
                    price: overrides.lines[0].price,
                    period: overrides.lines[0].period
                })
            ],
            has_more: false,
            url: ''
        }
    };
}
