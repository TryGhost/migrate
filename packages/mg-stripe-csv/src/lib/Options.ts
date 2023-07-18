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
            type: 'boolean',
            flags: '--pause',
            defaultValue: false,
            desc: 'Pause collection of old subscriptions in the old account after they have been recreated in the new account'
        },
        {
            type: 'boolean',
            flags: '--debug',
            defaultValue: false,
            desc: 'Print debug output'
        },
        {
            type: 'string',
            flags: '--test-clock',
            defaultValue: null,
            desc: 'Import subscriptions associated with a test clock'
        },
        {
            type: 'number',
            flags: '--delay',
            defaultValue: 12,
            desc: 'Period in hours in which newly created subscriptions won\'t create any charges (subscriptions that expire in this period will be delayed a bit). Within this period you should be able to confirm the migration or revert it. Defaults to 12.'
        }
    ];

    dryRun: boolean;
    verboseLevel: 0 | 1 | 2;
    oldApiKey?: string;
    newApiKey?: string;
    pause: boolean;
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
        this.pause = argv.pause ?? false;
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
