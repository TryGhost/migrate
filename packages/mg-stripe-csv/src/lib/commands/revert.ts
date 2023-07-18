import chalk from 'chalk';
import Logger from '../Logger.js';
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

    try {
        // Step 1: Connect to Stripe
        const connector = new StripeConnector();
        const fromAccount = await connector.askForAccount('Which Stripe account did you migrate from?', options.oldApiKey);

        Logger.shared.startSpinner('Validating API-key');
        const {accountName, mode} = await fromAccount.validate();
        Logger.shared.succeed(`From: ${chalk.cyan(accountName)} in ${mode} mode`);

        const toAccount = await connector.askForAccount('Which Stripe account did you migrate to?', options.newApiKey);

        Logger.shared.startSpinner('Validating API-key');
        const {accountName: accountNameTo, mode: modeTo} = await toAccount.validate();
        Logger.shared.succeed(`To: ${chalk.cyan(accountNameTo)} in ${modeTo} mode\n`);

        if (toAccount.id === fromAccount.id) {
            Logger.shared.fail('You cannot migrate to the same account');
            process.exit(1);
        }

        // Confirm
        const confirmMigration = await _confirm({
            message: 'Revert migration from ' + chalk.green(accountName) + ' to ' + chalk.red(accountNameTo) + '?' + (options.dryRun ? ' (dry run)' : ''),
            default: false
        });

        if (!confirmMigration) {
            Logger.shared.fail('Revert cancelled');
            process.exit(1);
        }

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
            couponImporter
        });
        const warnings = await subscriptionImporter.revertAll();
        if (warnings) {
            Logger.shared.succeed(`Successfully reverted ${stats.importedPerType.get('subscription') ?? 0} subscriptions with ${warnings.length} warning${warnings.length > 1 ? 's' : ''}:`);
            Logger.shared.warn(warnings.toString());
        } else {
            Logger.shared.succeed(`Successfully reverted all subscriptions`);
        }

        stats.print();
    } catch (e) {
        Logger.shared.fail(e);
        stats.print();
        process.exit(1);
    }
}
