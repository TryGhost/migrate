import {Logger, Options, copy, confirm, revert} from '@tryghost/mg-stripe';

const id = 'stripe';
const group = 'Sources:';
const flags = 'stripe';
const desc = 'Migrate Stripe products, prices, coupons, invoices and subscriptions to another Stripe account';

const setup = (sywac) => {
    for (const option of Options.definitions) {
        sywac.option(option);
    }

    sywac.command({
        id: 'copy',
        flags: 'copy',
        desc: 'Copy subscriptions from the old Stripe account to the new one. It will also pause existing subscriptions in the old account. This command can be run multiple times, already migrated subscriptions will be skipped.',
        run: async (argv) => {
            const options = Options.init(argv);
            Logger.init({verboseLevel: options.verboseLevel, debug: options.debug});

            await copy(options);
        }
    });

    sywac.command({
        id: 'confirm',
        flags: 'confirm',
        desc: 'Confirm migration to the new Stripe account. This command will finalise any open invoices.',
        run: async (argv) => {
            const options = Options.init(argv);
            Logger.init({verboseLevel: options.verboseLevel, debug: options.debug});

            await confirm(options);
        }
    });

    sywac.command({
        id: 'revert',
        flags: 'revert',
        desc: 'Revert the migration. This command will clean up the new Stripe account and resume the subscriptions from the old Stripe account',
        run: async (argv) => {
            const options = Options.init(argv);
            Logger.init({verboseLevel: options.verboseLevel, debug: options.debug});

            await revert(options);
        }
    });
};

export default {
    id,
    group,
    flags,
    desc,
    setup
};

