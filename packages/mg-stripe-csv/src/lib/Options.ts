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
        {
            type: 'boolean',
            flags: '--dry-run',
            defaultValue: false,
            desc: 'Run the import without actually creating any subscriptions'
        },
        {
            type: 'boolean',
            flags: '--verbose -v',
            defaultValue: false,
            desc: 'Print verbose output'
        }
    ];

    coupons: string
    prices: string
    subscriptions: string
    dryRun: boolean
    verbose: boolean

    constructor(argv: any) {
        this.coupons = argv.coupons;
        this.prices = argv.prices;
        this.subscriptions = argv.subscriptions;
        this.dryRun = argv['dry-run'];
        this.verbose = argv.verbose;
    }
}
