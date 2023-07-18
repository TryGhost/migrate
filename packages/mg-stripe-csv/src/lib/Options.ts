export class Options {
    /**
     * Sywac (https://sywac.io) command option definitions
     */
    static definitions = [
        {
            type: 'boolean',
            flags: '--dry-run',
            defaultValue: false,
            desc: 'Run the import without actually creating any subscriptions'
        },
        {
            type: 'string',
            flags: '--from',
            defaultValue: false,
            desc: 'The Stripe API key of the old account (optional)'
        },
        {
            type: 'string',
            flags: '--to',
            defaultValue: false,
            desc: 'The Stripe API key of the new account (optional)'
        },
        {
            type: 'number',
            flags: '--delay',
            defaultValue: 12,
            desc: 'Period in hours in which newly created subscriptions won\'t create any charges (subscriptions that expire in this period will be delayed a bit). Within this period you should be able to confirm the migration or revert it. Defaults to 12.'
        },
        {
            type: 'boolean',
            flags: '--debug',
            defaultValue: false,
            desc: 'Print debug output'
        },
        {
            type: 'number',
            flags: '--verbose -v',
            defaultValue: false,
            desc: 'Print verbose output'
        },
        {
            type: 'boolean',
            // Somehow -vv is not working in sywac
            flags: '--very-verbose',
            defaultValue: false,
            desc: 'Print very verbose output'
        }
    ];

    dryRun: boolean;
    verboseLevel: 0 | 1 | 2;
    oldApiKey?: string;
    newApiKey?: string;
    debug: boolean;
    testClock?: string;
    forceRecreate: boolean;
    pausePeriod: number;

    static shared: Options;

    constructor(argv: any) {
        this.dryRun = argv['dry-run'];
        this.verboseLevel = argv['very-verbose'] ? 2 : argv.verbose ? 1 : 0;
        this.oldApiKey = argv.from ?? undefined;
        this.newApiKey = argv.to ?? undefined;
        this.debug = argv.debug ?? false;
        this.testClock = argv['test-clock'] ?? undefined;
        this.forceRecreate = argv['force-recreate'] ?? false;
        this.pausePeriod = argv.delay ?? 12;
    }

    static init(argv: any) {
        Options.shared = new Options(argv);
        return Options.shared;
    }
}
