import {confirm} from '@inquirer/prompts';
import chalk from 'chalk';
import Logger from './Logger.js';
import {Options} from "./Options.js";
import {StripeConnector} from "./StripeConnector.js";
import {ImportStats} from './importers/ImportStats.js';
import {createProductImporter} from './importers/createProductImporter.js';
import {createPriceImporter} from './importers/createPriceImporter.js';
import {createSubscriptionImporter} from './importers/createSubscriptionImporter.js';
import {createCouponImporter} from './importers/createCouponImporter.js';

class StripeCSVCommand {
    id = 'stripe-csv';
    group = 'Sources:';
    flags = "stripe-csv"
    desc = 'Migrate your Stripe subscriptions to a different Stripe account';

    constructor() {
        // FIX `this` binding in the `run` method
        this.run = this.run.bind(this)
        this.setup = this.setup.bind(this)

    }

    async setup(sywac: any) {
        for (const option of Options.definitions) {
            sywac.option(option);
        }
    }

    async run(argv: any) {
        Options.init(argv);
        const options = Options.shared;
        Logger.init({verboseLevel: options.verboseLevel});
        if (options.dryRun) {
            Logger.shared.info(`Running in dry run mode`);
        }
        const stats = new ImportStats()

        try {

            // Step 1: Connect to Stripe
            const connector = new StripeConnector(options.test ? 'test' : 'live');
            const fromAccount = await connector.askForAccount('Which Stripe account do you want to migrate from?', options.oldApiKey);

            Logger.shared.startSpinner('Validating connection');
            const {accountName, mode} = await fromAccount.validate();
            Logger.shared.succeed(`Migrating from: ${chalk.cyan(accountName)} in ${mode} mode\n`);

            const toAccount = await connector.askForAccount('Which Stripe account do you want to migrate to?', options.newApiKey, [fromAccount.id]);

            Logger.shared.startSpinner('Validating connection');
            const {accountName: accountNameTo, mode: modeTo} = await toAccount.validate();
            Logger.shared.succeed(`Migrating to: ${chalk.cyan(accountNameTo)} in ${modeTo} mode\n`);

            if (toAccount.id === fromAccount.id) {
                Logger.shared.fail('You cannot migrate to the same account');
                process.exit(1);
            }

            // Confirm
            const confirmMigration = await confirm({
                message: 'Migrate from ' + chalk.red(accountName) + ' to ' + chalk.green(accountNameTo) + '?' + (options.dryRun ? ' (dry run)' : ''),
                default: false
            });

            if (!confirmMigration) {
                Logger.shared.fail('Migration cancelled');
                process.exit(1);
            }

            // Step 2: Import data
            Logger.shared.startSpinner('Importing data');
            stats.addListener(() => {
                Logger.shared.processSpinner(stats.toString());
            });

            const sharedOptions = {
                dryRun: options.dryRun,
                stats,
                oldStripe: fromAccount,
                newStripe: toAccount,
            };

            const productImporter = createProductImporter({
                ...sharedOptions
            })

            const priceImporter = createPriceImporter({
                ...sharedOptions,
                productImporter,
            })

            const couponImporter = createCouponImporter({
                ...sharedOptions
            })

            const subscriptionImporter = createSubscriptionImporter({
                ...sharedOptions,
                priceImporter,
                couponImporter
            })
            await subscriptionImporter.recreateAll();
            Logger.shared.succeed(`Successfully imported all subscriptions`);

            stats.print();

        } catch (e) {
            Logger.shared.fail(e);

            if (stats.totalImported || stats.totalReused) {
                stats.print();
            }
            process.exit(1);
        }
    }
}

export default new StripeCSVCommand();
