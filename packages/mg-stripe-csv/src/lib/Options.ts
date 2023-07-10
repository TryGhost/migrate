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
            flags: '--test',
            defaultValue: false,
            desc: 'Connect to the Stripe Test API when using Stripe CLI as authentication method'
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
        }
    ];

    dryRun: boolean;
    verboseLevel: 0 | 1 | 2;
    oldApiKey?: string;
    newApiKey?: string;
    test: boolean;
    pause: boolean;
    debug: boolean;
    testClock?: string;

    static shared: Options;

    constructor(argv: any) {
        this.dryRun = argv['dry-run'];
        this.verboseLevel = argv['very-verbose'] ? 2 : argv.verbose ? 1 : 0;
        this.oldApiKey = argv.from ?? undefined;
        this.newApiKey = argv.to ?? undefined;
        this.test = argv.test ?? false;
        this.pause = argv.pause ?? false;
        this.debug = argv.debug ?? false;
        this.testClock = argv['test-clock'] ?? undefined;
    }

    static init(argv: any) {
        Options.shared = new Options(argv);
    }
}
