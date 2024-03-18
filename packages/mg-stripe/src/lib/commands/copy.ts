import chalk from 'chalk';
import {Logger} from '../Logger.js';
import {StripeConnector} from '../StripeConnector.js';
import {ImportStats} from '../importers/ImportStats.js';
import {createCouponImporter} from '../importers/createCouponImporter.js';
import {createPriceImporter} from '../importers/createPriceImporter.js';
import {createProductImporter} from '../importers/createProductImporter.js';
import {createSubscriptionImporter} from '../importers/createSubscriptionImporter.js';
import {Options} from '../Options.js';
import {confirm} from '@inquirer/prompts';
import {DelayPrompt} from '../DelayPrompt.js';
import {Reporter, ReportingCategory} from '../importers/Reporter.js';
import {isWarning} from '../helpers.js';
import {ErrorGroup} from '../importers/ErrorGroup.js';

export async function copy(options: Options) {
    const stats = new ImportStats();
    const reporter = new Reporter(new ReportingCategory(''));

    Logger.shared.info(`The ${chalk.cyan('copy')} command will:`);
    Logger.shared.info(`- Migrate Stripe products, prices, coupons, invoices and subscriptions from an old to a new Stripe account.`);
    Logger.shared.info(`- Recreate subscriptions without Platform fees within the same Stripe account.`);
    Logger.shared.info('');
    Logger.shared.info('Created subscriptions will be delayed by 1 hour by default (change with --delay option) - their renew date will only change if they would normally renew within that delay period');
    Logger.shared.info('This makes sure you can still undo the migration (using the revert command) if something goes wrong within that time frame and avoid charging customers.');
    Logger.shared.info('------------------------------------------------------------------------------');
    Logger.shared.info('Before proceeding, be sure to have:');
    Logger.shared.info('1) Disabled new subscriptions on the old site');
    Logger.shared.info('2) Copied all Stripe customers, using the Stripe dashboard:');
    Logger.shared.info('https://stripe.com/docs/payments/account/data-migrations/pan-copy-self-serve');
    Logger.shared.info('------------------------------------------------------------------------------');
    Logger.shared.info(`We recommend running a dry run first, by passing the ${chalk.cyan('--dry-run')} option.`);
    Logger.shared.info('The dry run will not create any data object in the new account, nor update anything in the old account.');
    Logger.shared.info('------------------------------------------------------------------------------');
    Logger.shared.newline();

    Logger.shared.startSpinner('');
    if (options.dryRun) {
        Logger.shared.succeed(`Running ${chalk.green('copy')} command as ${chalk.green('DRY RUN')}. No Stripe data will be created or updated.`);
    } else {
        Logger.shared.succeed(`Running ${chalk.green('copy')} command...`);
    }

    if (options.subscription) {
        Logger.shared.newline();
        Logger.shared.warn(`Migration is limited to subscription with ID ${options.subscription}`);
        Logger.shared.newline();
    }

    try {
        // Get delay
        const delay = (options.dryRun) ? 1 : (await new DelayPrompt().ask(options.delay));

        Logger.shared.startSpinner('');

        if (!options.dryRun) {
            Logger.shared.succeed(`No payments will be collected for the next ${chalk.green(delay)} hour(s)`);
        }

        // Get from / to Stripe accounts
        const connector = new StripeConnector();
        const {fromAccount, toAccount} = await connector.askAccounts(options);

        const confirmMigration = await confirm({
            message: 'Confirm copy?' + (options.dryRun ? ' (dry run)' : ''),
            default: true
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
            delay
        });

        let warnings: ErrorGroup|undefined = new ErrorGroup();

        if (options.subscription) {
            try {
                await subscriptionImporter.recreateByID(options.subscription);
            } catch (e: any) {
                if (isWarning(e)) {
                    // Only log warnings immediately in verbose mode
                    Logger.v?.warn(e.toString());
                } else {
                    Logger.shared.error(e.toString());
                }
                warnings.add(e);
            }
        } else {
            warnings = await subscriptionImporter.recreateAll();
        }

        Logger.shared.succeed(`Finished`);
        Logger.shared.newline();

        if (warnings && !warnings.isEmpty) {
            Logger.shared.warn(warnings.toString());
            Logger.shared.newline();
        }

        reporter.print({});
        Logger.shared.newline();

        // Newline
        if (!options.dryRun) {
            Logger.shared.warn(`Do not forget to run the ${chalk.cyan('confirm')} command to confirm the migration`);
        }
    } catch (e) {
        Logger.shared.fail(e);

        Logger.shared.newline();
        stats.print();

        Logger.shared.newline();
        Logger.shared.info(`You can either fix the issue and retry the ${chalk.cyan('copy')} command (will continue where it left off), or run ${chalk.cyan('revert')} command to revert the migration`);
        process.exit(1);
    }
}
