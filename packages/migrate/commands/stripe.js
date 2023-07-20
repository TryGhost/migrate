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
        desc: 'Copy subscriptions from the old Stripe account to the new one. Before running this, make sure that the old site is not accepting any new subscriptions, and that you have migrated Stripe customers using the Stripe dashboard (https://stripe.com/docs/payments/account/data-migrations/pan-copy-self-serve). This command will pause existing subscriptions in the old account and activate them on the new account. The payment collection is paused in the new account by 12 hours by default (can be changed with the --delay option). This command can be run multiple times, already migrated subscriptions will be skipped.',
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

