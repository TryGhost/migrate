export class Options {
    /**
     * Sywac (https://sywac.io) command option definitions
     */
    static definitions = [
        {
            type: 'file',
            flags: '--coupons',
            mustExist: true,
            required: true,
            desc: 'Path pointing to a CSV file containing the coupons exported from your old Stripe account'
        },
        {
            type: 'file',
            flags: '--products',
            mustExist: true,
            required: true,
            desc: 'Path pointing to a CSV file containing the products exported from your old Stripe account'
        },
        {
            type: 'file',
            flags: '--prices',
            mustExist: true,
            required: true,
            desc: 'Path pointing to a CSV file containing the prices exported from your old Stripe account'
        },
        {
            type: 'file',
            flags: '--subscriptions',
            mustExist: true,
            required: true,
            desc: 'Path pointing to a CSV file containing the subscriptions exported from your old Stripe account'
        },
    ];

    coupons: string
    products: string
    prices: string
    subscriptions: string

    constructor(argv: any) {
        console.log(argv);
        this.coupons = argv.coupons;
        this.products = argv.products;
        this.prices = argv.prices;
        this.subscriptions = argv.subscriptions;
    }
}
