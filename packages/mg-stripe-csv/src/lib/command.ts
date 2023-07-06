import {confirm} from '@inquirer/prompts';
import chalk from 'chalk';
import Logger from './Logger.js';
import {Options} from "./Options.js";
import {StripeConnector} from "./StripeConnector.js";
import {ImportStats} from './importers/ImportStats.js';
import {createProductImporter} from './importers/createProductImporter.js';
import {createPriceImporter} from './importers/createPriceImporter.js';
import {createSubscriptionImporter} from './importers/createSubscriptionImporter.js';

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
        const options = new Options(argv);
        Logger.init({verboseLevel: options.verboseLevel});
        Logger.shared.info(`Running in dry run mode: ${options.dryRun ? 'yes' : 'no'}`);

        try {

            // Step 1: Connect to Stripe
            const connector = new StripeConnector();
            const fromAccount = await connector.askForAccount('Which Stripe account do you want to migrate from?');

            Logger.shared.startSpinner('Validating connection');
            const {accountName, mode} = await fromAccount.validate();
            Logger.shared.succeed(`Migrating from Stripe account: ${chalk.blue(accountName)} in ${mode} mode\n`);

            const toAccount = await connector.askForAccount('Which Stripe account do you want to migrate to?');

            Logger.shared.startSpinner('Validating connection');
            const {accountName: accountNameTo, mode: modeTo} = await toAccount.validate();
            Logger.shared.succeed(`Migrating to Stripe account: ${chalk.blue(accountNameTo)} in ${modeTo} mode\n`);

            if (toAccount.id === fromAccount.id) {
                Logger.shared.fail('You cannot migrate to the same account');
                process.exit(1);
            }

            // Confirm
            const confirmMigration = await confirm({
                message: 'Migrate from ' + chalk.blue(accountName) + ' to ' + chalk.blue(accountNameTo) + '?',
                default: false
            });

            if (!confirmMigration) {
                Logger.shared.fail('Migration cancelled');
                process.exit(1);
            }

            // Step 2: Import data
            Logger.shared.startSpinner('Importing data');
            const stats = new ImportStats()
            stats.addListener(() => {
                Logger.shared.processSpinner(stats.toString());
            });

            const productImporter = createProductImporter({
                stats,
                oldStripe: fromAccount,
                newStripe: toAccount,
            })

            const priceImporter = createPriceImporter({
                stats,
                oldStripe: fromAccount,
                newStripe: toAccount,
                productImporter,
            })

            const subscriptionImporter = createSubscriptionImporter({
                stats,
                oldStripe: fromAccount,
                newStripe: toAccount,
                priceImporter
            })
            await subscriptionImporter.recreateAll();
            Logger.shared.succeed(`Successfully imported all subscriptions`);

            /*const couponImporter = getCouponImporter(options.coupons);
            const priceImporter = getPriceImporter(options.prices);
            const subscriptionImporter = getSubscriptionImporter({
                filePath: options.subscriptions,
                importers: {
                    coupons: couponImporter,
                    prices: priceImporter
                }
            });

            await subscriptionImporter.importAll({
                dryRun: options.dryRun,
                stripe: fromAccount,
                stats,
                verbose: options.verbose
            });*/

            stats.print();

        } catch (e) {
            Logger.shared.fail(e);
            process.exit(1);
        }
    }
}

export default new StripeCSVCommand();
