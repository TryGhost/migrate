import chalk from 'chalk';
import {Logger} from '../Logger.js';
import {StripeConnector} from '../StripeConnector.js';
import {createCouponImporter} from '../importers/createCouponImporter.js';
import {createPriceImporter} from '../importers/createPriceImporter.js';
import {createProductImporter} from '../importers/createProductImporter.js';
import {createSubscriptionImporter} from '../importers/createSubscriptionImporter.js';
import {Options} from '../Options.js';
import {confirm as _confirm} from '@inquirer/prompts';
import {Reporter, ReportingCategory} from '../importers/Reporter.js';

export async function revert(options: Options) {
    const reporter = new Reporter(new ReportingCategory('', {skipTitle: true}));

    Logger.shared.info(`The ${chalk.cyan('revert')} command will delete the copy of Stripe products, prices, coupons, subscriptions and invoices from the new Stripe account. It will also resume the subscriptions in the old Stripe account.`);
    Logger.shared.info('------------------------------------------------------------------------------');
    Logger.shared.info('Before proceeding, be sure to have:');
    Logger.shared.info(`1) Executed the ${chalk.cyan('copy')} command`);
    Logger.shared.info('2) Verified that the errors cannot be resolved manually from the Stripe dashboard');
    Logger.shared.info('------------------------------------------------------------------------------');
    Logger.shared.newline();

    Logger.shared.startSpinner('');
    if (options.dryRun) {
        Logger.shared.succeed(`Running ${chalk.green('revert')} command as ${chalk.green('DRY RUN')}. No Stripe data will be updated or deleted.`);
    } else {
        Logger.shared.succeed(`Running ${chalk.green('revert')} command...`);
    }

    try {
        // Step 1: Connect to Stripe
        const connector = new StripeConnector();
        const {fromAccount, toAccount} = await connector.askAccounts(options);

        const confirmMigration = await _confirm({
            message: 'Revert copy?' + (options.dryRun ? ' (dry run)' : ''),
            default: true
        });

        if (!confirmMigration) {
            Logger.shared.fail('Revert cancelled');
            process.exit(1);
        }

        // Step 2: Import data
        Logger.shared.startSpinner('Reverting subscriptions...');
        reporter.addListener(() => {
            Logger.shared.processSpinner('Reverting subscriptions...\n\n' + reporter.toString());
        });

        const sharedOptions = {
            dryRun: options.dryRun,
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

        const warnings = await subscriptionImporter.revertAll();

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
        reporter.print({});
        process.exit(1);
    }
}
