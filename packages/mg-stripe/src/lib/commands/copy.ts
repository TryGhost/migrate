import chalk from 'chalk';
import Logger from '../Logger.js';
import {StripeConnector} from '../StripeConnector.js';
import {ImportStats} from '../importers/ImportStats.js';
import {createCouponImporter} from '../importers/createCouponImporter.js';
import {createPriceImporter} from '../importers/createPriceImporter.js';
import {createProductImporter} from '../importers/createProductImporter.js';
import {createSubscriptionImporter} from '../importers/createSubscriptionImporter.js';
import {Options} from '../Options.js';
import {confirm} from '@inquirer/prompts';
import {DelayPrompt} from '../DelayPrompt.js';

export async function copy(options: Options) {
    const stats = new ImportStats();

    Logger.shared.info(`The ${chalk.cyan('copy')} command will migrate Stripe products, prices, coupons, invoices and subscriptions from an old to a new Stripe account.`);
    Logger.shared.info('------------------------------------------------------------------------------');
    Logger.shared.info('Before proceeding, be sure to have:');
    Logger.shared.info('1) Disabled new subscriptions on the old site');
    Logger.shared.info('2) Copied all Stripe customers, using the Stripe dashboard:');
    Logger.shared.info('https://stripe.com/docs/payments/account/data-migrations/pan-copy-self-serve');
    Logger.shared.info('------------------------------------------------------------------------------');
    Logger.shared.info(`We recommend running a dry run first, by passing the ${chalk.cyan('--dry-run')} option.`);
    Logger.shared.info('The dry run will not create any data object in the new account, nor update anything in the old account.');
    Logger.shared.info('------------------------------------------------------------------------------');

    Logger.shared.startSpinner('');
    if (options.dryRun) {
        Logger.shared.succeed(`Starting copy in ${chalk.green('DRY RUN')} mode. No Stripe data will be created or updated.`);
    } else {
        Logger.shared.succeed(`Starting copy in ${chalk.green('LIVE')} mode.`);
    }

    try {
        // Get delay
        const delay = await new DelayPrompt().ask(options.delay);

        Logger.shared.startSpinner('');
        Logger.shared.succeed(`No payments will be collected for the next ${chalk.green(delay)} hour(s)`);

        // Get from / to Stripe accounts
        const connector = new StripeConnector();
        const fromAccount = await connector.askForAccount('From which Stripe account do you want to copy?', options.oldApiKey);

        Logger.shared.startSpinner('Validating API-key');
        const {accountName, mode} = await fromAccount.validate();
        Logger.shared.succeed(`Copying from ${chalk.green(accountName)} (${mode} account)`);

        const toAccount = await connector.askForAccount('To which Stripe account do you want to copy?', options.newApiKey);

        Logger.shared.startSpinner('Validating API-key');
        const {accountName: accountNameTo, mode: modeTo} = await toAccount.validate();
        Logger.shared.succeed(`Copying to ${chalk.green(accountNameTo)} (${modeTo} account)\n`);

        if (toAccount.id === fromAccount.id) {
            Logger.shared.fail('You cannot copy data to the same account');
            process.exit(1);
        }

        // Confirm
        const confirmMigration = await confirm({
            message: 'Copy from ' + chalk.red(accountName) + ' to ' + chalk.green(accountNameTo) + '?' + (options.dryRun ? ' (dry run)' : ''),
            default: false
        });

        if (!confirmMigration) {
            Logger.shared.fail('Copy cancelled');
            process.exit(1);
        }

        stats.markStart();

        // Step 2: Import data
        Logger.shared.startSpinner('Recreating subscriptions...');
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
            delay
        });
        const warnings = await subscriptionImporter.recreateAll();
        if (warnings) {
            Logger.shared.succeed(`Successfully recreated ${stats.importedPerType.get('subscription') ?? 0} subscriptions with ${warnings.length} warning${warnings.length > 1 ? 's' : ''}:`);
            Logger.shared.warn(warnings.toString());
        } else {
            Logger.shared.succeed(`Successfully recreated all subscriptions`);
        }

        stats.print();
    } catch (e) {
        Logger.shared.fail(e);

        stats.print();
        process.exit(1);
    }
}
