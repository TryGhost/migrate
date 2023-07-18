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
    id = 'stripe-csv';
    group = 'Sources:';
    flags = 'stripe-csv';
    desc = 'Migrate your Stripe subscriptions to a different Stripe account';

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
            desc: 'Copy subscriptions from one Stripe account to another. Pausing subscriptions in the old account and the newly created subscriptions. Before running this, make sure no new subscriptions can be created in the old Stripe account. This command can be run multiple times (already migrated subscriptions will be skipped).',
            run: async (argv: any) => {
                const options = Options.init(argv);
                Logger.init({verboseLevel: options.verboseLevel, debug: options.debug});

                await copyCommand(options);
            }
        });

        sywac.command({
            id: 'confirm',
            flags: 'confirm',
            desc: 'Confirm copy by unpausing the subscriptions created in the new Stripe account. If some old subscriptions were cancelled during the copy, it will also cancel them in the newly created subscription.',
            run: async (argv: any) => {
                const options = Options.init(argv);
                Logger.init({verboseLevel: options.verboseLevel, debug: options.debug});

                await confirmCommand(options);
            }
        });

        sywac.command({
            id: 'revert',
            flags: 'revert',
            desc: 'Unpause the subscriptions created in the old Stripe account and revert all changes made to the new Stripe account.',
            run: async (argv: any) => {
                const options = Options.init(argv);
                Logger.init({verboseLevel: options.verboseLevel, debug: options.debug});

                await revertCommand(options);
            }
        });
    }
}

export default new StripeCSVCommand();
