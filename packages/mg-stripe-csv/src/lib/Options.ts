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
        }
    ];

    dryRun: boolean
    verboseLevel: 0 | 1 | 2

    constructor(argv: any) {
        this.dryRun = argv['dry-run'];
        this.verboseLevel = argv['very-verbose'] ? 2 : argv.verbose ? 1 : 0;
    }
}
