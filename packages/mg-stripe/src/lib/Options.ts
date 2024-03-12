export class Options {
    /**
     * Sywac (https://sywac.io) command option definitions
     */
    static definitions = [
        {
            type: 'boolean',
            flags: '--dry-run',
            defaultValue: false,
            desc: 'Dry run a copy, without actually creating any data object in the new account (optional)'
        },
        {
            type: 'string',
            flags: '--from',
            defaultValue: false,
            desc: 'The Stripe API secret key of the old account (optional)'
        },
        {
            type: 'string',
            flags: '--to',
            defaultValue: false,
            desc: 'The Stripe API secret key of the new account (optional)'
        },
        {
            type: 'number',
            flags: '--delay',
            defaultValue: null,
            desc: 'Period (in hours, starting now) during which payment collection is paused. This period should be large enough to cover the entire migration. Estimated time to migrate 10,000 members is 1 hour, we recommend adding an extra hour of buffer time to be safe (optional)'
        },
        {
            type: 'boolean',
            flags: '--debug',
            defaultValue: false,
            desc: 'Print debug output (optional)'
        },
        {
            type: 'boolean',
            flags: '--verbose -v',
            defaultValue: false,
            desc: 'Print verbose output (optional)'
        },
        {
            type: 'boolean',
            // Somehow -vv is not working in sywac
            flags: '--very-verbose',
            defaultValue: false,
            desc: 'Print very verbose output (optional)'
        }
    ];

    dryRun: boolean;
    verboseLevel: 0 | 1 | 2;
    oldApiKey?: string;
    newApiKey?: string;
    debug: boolean;
    testClock?: string;
    forceRecreate: boolean;
    delay: number | null;

    static shared: Options;

    constructor(argv: any) {
        this.dryRun = argv['dry-run'];
        this.verboseLevel = argv['very-verbose'] ? 2 : (argv.verbose ? 1 : 0);
        this.oldApiKey = argv.from ?? undefined;
        this.newApiKey = argv.to ?? undefined;
        this.debug = argv.debug ?? false;
        this.testClock = argv['test-clock'] ?? undefined;
        this.forceRecreate = argv['force-recreate'] ?? false;
        this.delay = argv.delay ?? null;
    }

    static init(argv: any) {
        Options.shared = new Options(argv);
        return Options.shared;
    }
}
