import {ui} from '@tryghost/pretty-cli';
import {Options} from "./Options.js";
import {StripeAPI} from "./StripeAPI.js";
import {StripeConnector} from "./StripeConnector.js";
import {getCouponImporter} from "./importers/CouponImporter.js";
import {getPriceImporter} from "./importers/PriceImporter.js";
import {getSubscriptionImporter} from "./importers/SubscriptionImporter.js";
import {ImportStats} from './importers/ImportStats.js';
import ora from 'ora';
import Logger from './logger.js';

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
        Logger.init({verbose: options.verbose});
        Logger.shared.info(`Running in dry run mode: ${options.dryRun ? 'yes' : 'no'}`);

        try {
            // Step 1: Connect to Stripe
            Logger.shared.startSpinner('Connecting to Stripe');
            const stripe = new StripeConnector();

            await stripe.connect();

            Logger.shared.processSpinner('Validating connection');
            const {accountName, mode} = await StripeAPI.shared.validate();
            Logger.shared.succeed(`Connected to Stripe account: ${accountName} in ${mode} mode`);

            // Step 2: Import data
            Logger.shared.startSpinner('Importing data');
            const stats = new ImportStats()
            stats.addListener(() => {
                Logger.shared.processSpinner(stats.toString());
            });

            const couponImporter = getCouponImporter(options.coupons);
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
                stripe: StripeAPI.shared,
                stats,
                verbose: options.verbose
            });
            Logger.shared.succeed(`Successfully imported all subscriptions`);

            stats.print();

        } catch (e) {
            Logger.shared.fail(e);
            process.exit(1);
        }
    }
}

export default new StripeCSVCommand();
