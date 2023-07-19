import {confirm} from '@inquirer/prompts';
import chalk from 'chalk';
import Logger from './Logger.js';
import {Options} from './Options.js';
import {StripeConnector} from './StripeConnector.js';
import {ImportStats} from './importers/ImportStats.js';
import {createProductImporter} from './importers/createProductImporter.js';
import {createPriceImporter} from './importers/createPriceImporter.js';
import {createSubscriptionImporter} from './importers/createSubscriptionImporter.js';
import {createCouponImporter} from './importers/createCouponImporter.js';
import {confirm as confirmCommand} from './commands/confirm.js';
import {revert as revertCommand} from './commands/revert.js';
import {copy as copyCommand} from './commands/copy.js';

class StripeCSVCommand {
    id = 'stripe';
    group = 'Sources:';
    flags = 'stripe';
    desc = 'Migrate Stripe products, prices, coupons, invoices and subscriptions to another Stripe account';

    constructor() {
        // FIX `this` binding (sywac)
        this.setup = this.setup.bind(this);
    }

    async setup(sywac: any) {
        for (const option of Options.definitions) {
            sywac.option(option);
        }

        sywac.command({
            id: 'copy',
            flags: 'copy',
            desc: 'Copy subscriptions from the old Stripe account to the new one. Before running this, make sure that the old site is not accepting any new subscriptions, and that you have migrated Stripe customers using the Stripe dashboard (https://stripe.com/docs/payments/account/data-migrations/pan-copy-self-serve). This command will pause existing subscriptions in the old account and activate them on the new account. The payment collection is paused in the new account by 12 hours by default (can be changed with the --delay option). This command can be run multiple times, already migrated subscriptions will be skipped.',
            run: async (argv: any) => {
                const options = Options.init(argv);
                Logger.init({verboseLevel: options.verboseLevel, debug: options.debug});

                await copyCommand(options);
            }
        });

        sywac.command({
            id: 'confirm',
            flags: 'confirm',
            desc: 'Confirm migration to the new Stripe account. This command will finalise any open invoices.',
            run: async (argv: any) => {
                const options = Options.init(argv);
                Logger.init({verboseLevel: options.verboseLevel, debug: options.debug});

                await confirmCommand(options);
            }
        });

        sywac.command({
            id: 'revert',
            flags: 'revert',
            desc: 'Revert the migration. This command will clean up the new Stripe account and resume the subscriptions from the old Stripe account',
            run: async (argv: any) => {
                const options = Options.init(argv);
                Logger.init({verboseLevel: options.verboseLevel, debug: options.debug});

                await revertCommand(options);
            }
        });
    }
}

export default new StripeCSVCommand();
