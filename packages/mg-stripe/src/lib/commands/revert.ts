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

export async function revert(options: Options) {
    const stats = new ImportStats();

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
        const fromAccount = await connector.askForAccount('From which Stripe account did you copy?', options.oldApiKey);

        Logger.shared.startSpinner('Validating API-key');
        const {accountName, mode} = await fromAccount.validate();
        Logger.shared.succeed(`From ${chalk.cyan(accountName)} (${mode} account)`);

        const toAccount = await connector.askForAccount('To which Stripe account did you copy?', options.newApiKey);

        Logger.shared.startSpinner('Validating API-key');
        const {accountName: accountNameTo, mode: modeTo} = await toAccount.validate();
        Logger.shared.succeed(`To ${chalk.cyan(accountNameTo)} (${modeTo} account)\n`);

        if (toAccount.id === fromAccount.id) {
            Logger.shared.fail('You cannot revert a copy from the same account');
            process.exit(1);
        }

        // Confirm
        const confirmMigration = await _confirm({
            message: 'Revert copy from ' + chalk.green(accountName) + ' to ' + chalk.red(accountNameTo) + '?' + (options.dryRun ? ' (dry run)' : ''),
            default: false
        });

        if (!confirmMigration) {
            Logger.shared.fail('Revert cancelled');
            process.exit(1);
        }

        stats.markStart();

        // Step 2: Import data
        Logger.shared.startSpinner('Reverting subscriptions...');
        stats.addListener(() => {
            Logger.shared.processSpinner(stats.toString());
        });

        const sharedOptions = {
            dryRun: options.dryRun,
            stats,
            oldStripe: fromAccount,
            newStripe: toAccount
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

        if (warnings) {
            Logger.shared.newline();
            Logger.shared.succeed(`Successfully reverted ${stats.revertedPerType.get('subscription') ?? 0} subscriptions with ${warnings.length} warning${warnings.length > 1 ? 's' : ''}:`);
            Logger.shared.newline();

            Logger.shared.warn(warnings.toString());
        } else {
            Logger.shared.succeed(`Successfully reverted all subscriptions`);
        }

        Logger.shared.newline();
        stats.print();
    } catch (e) {
        Logger.shared.fail(e);

        Logger.shared.newline();
        stats.print();
        process.exit(1);
    }
}
