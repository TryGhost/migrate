import chalk from 'chalk';
import {Logger} from '../Logger.js';
import {StripeConnector} from '../StripeConnector.js';
import {ImportStats} from '../importers/ImportStats.js';
import {createCouponImporter} from '../importers/createCouponImporter.js';
import {createPriceImporter} from '../importers/createPriceImporter.js';
import {createProductImporter} from '../importers/createProductImporter.js';
import {createSubscriptionImporter} from '../importers/createSubscriptionImporter.js';
import {Options} from '../Options.js';
import {confirm as _confirm} from '@inquirer/prompts';
import {Reporter, ReportingCategory} from '../importers/Reporter.js';

export async function confirm(options: Options) {
    const stats = new ImportStats();
    const reporter = new Reporter(new ReportingCategory(''));

    Logger.shared.info(`The ${chalk.cyan('confirm')} command will finalise the copy of Stripe subscriptions and invoices in the new Stripe account.`);
    Logger.shared.info('------------------------------------------------------------------------------');
    Logger.shared.info('Before proceeding, be sure to have:');
    Logger.shared.info(`1) Executed the ${chalk.cyan('copy')} command`);
    Logger.shared.info('2) Verified the products, prices, coupons, and subscriptions in the new Stripe account from the Stripe dashboard');
    Logger.shared.info('------------------------------------------------------------------------------');
    Logger.shared.newline();

    Logger.shared.startSpinner('');
    if (options.dryRun) {
        Logger.shared.succeed(`Running ${chalk.green('confirm')} command as ${chalk.green('DRY RUN')}. No Stripe data will be updated.`);
    } else {
        Logger.shared.succeed(`Running ${chalk.green('confirm')} command...`);
    }

    try {
        // Step 1: Connect to Stripe
        const connector = new StripeConnector();
        const {fromAccount, toAccount} = await connector.askAccounts(options);

        const confirmMigration = await _confirm({
            message: 'Confirm?' + (options.dryRun ? ' (dry run)' : ''),
            default: true
        });

        if (!confirmMigration) {
            Logger.shared.fail('Confirmation cancelled');
            process.exit(1);
        }
        stats.markStart();

        // Step 2: Import data
        Logger.shared.startSpinner('Confirming subscriptions...');
        stats.addListener(() => {
            Logger.shared.processSpinner(stats.toString());
        });

        const sharedOptions = {
            dryRun: options.dryRun,
            stats,
            oldStripe: fromAccount,
            newStripe: toAccount,
            reporter
        };

        const productImporter = createProductImporter({
            ...sharedOptions
        });

        const priceImporter = createPriceImporter({
            ...sharedOptions,
            productImporter
        });

        const couponImporter = createCouponImporter({
            ...sharedOptions
        });

        const subscriptionImporter = createSubscriptionImporter({
            ...sharedOptions,
            priceImporter,
            couponImporter,
            delay: 0
        });

        const warnings = await subscriptionImporter.confirmAll();

        Logger.shared.succeed(`Finished`);
        Logger.shared.newline();

        if (warnings) {
            Logger.shared.warn(warnings.toString());
            Logger.shared.newline();
        }

        reporter.print({});
        Logger.shared.newline();
    } catch (e) {
        Logger.shared.fail(e);

        Logger.shared.newline();
        stats.print();
        process.exit(1);
    }
}
