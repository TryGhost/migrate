import {confirm as _confirm} from '@inquirer/prompts';
import chalk from 'chalk';
import {Logger} from '../Logger.js';
import {Options} from '../Options.js';
import {StripeConnector} from '../StripeConnector.js';
import {ImportStats} from '../importers/ImportStats.js';
import {Reporter, ReportingCategory} from '../importers/Reporter.js';

export async function touch(options: Options) {
    const stats = new ImportStats();
    const reporter = new Reporter(new ReportingCategory(''));

    Logger.shared.info(`The ${chalk.cyan('touch')} command will make small metadata changes to subscriptions in Stripe to force Ghost to recheck subscription statuses.`);
    Logger.shared.newline();

    Logger.shared.startSpinner('');
    if (options.dryRun) {
        Logger.shared.succeed(`Running ${chalk.green('touch')} command as ${chalk.green('DRY RUN')}. No Stripe data will be updated.`);
    } else {
        Logger.shared.succeed(`Running ${chalk.green('touch')} command...`);
    }

    try {
        // Step 1: Connect to Stripe
        const connector = new StripeConnector();
        const fromAccount = await connector.askForAccount('Which Stripe account?', options.oldApiKey);

        Logger.shared.startSpinner('Validating API-key');
        const {accountName, mode} = await fromAccount.validate();
        Logger.shared.succeed(`Updating ${chalk.green(accountName)} (${mode} mode)`);

        const confirmMigration = await _confirm({
            message: 'Confirm?' + (options.dryRun ? ' (dry run)' : ''),
            default: true
        });

        if (!confirmMigration) {
            Logger.shared.fail('Touch cancelled');
            process.exit(1);
        }
        stats.markStart();

        // Step 2: Import data
        Logger.shared.startSpinner('Updating subscriptions metadata...');
        stats.addListener(() => {
            Logger.shared.processSpinner(stats.toString());
        });

        let lastSubscriptionId: string|null = null;
        let totalSubscriptions = 0;

        while (true) {
            const subscriptions = await fromAccount.use((client) => {
                return client.subscriptions.list({
                    limit: 100,
                    status: 'all',
                    starting_after: lastSubscriptionId ?? undefined
                });
            });

            for (const subscription of subscriptions.data) {
                if (!options.dryRun) {
                    await fromAccount.use((client) => {
                        if (subscription.status === 'canceled') {
                            // Can only update cancellation_details
                            return client.subscriptions.update(subscription.id, {
                                cancellation_details: {
                                    ...subscription.cancellation_details,
                                    comment: (subscription.cancellation_details?.comment ?? 'Touch') + ' ' // add a space to force update
                                }
                            });
                        } else {
                            return client.subscriptions.update(subscription.id, {
                                metadata: {
                                    ...subscription.metadata,
                                    ghost_touch: new Date().toISOString()
                                }
                            });
                        }
                    });

                    // Wait 1s
                    await new Promise((r) => {
                        setTimeout(r, 1000);
                    });
                }

                totalSubscriptions += 1;
                Logger.shared.processSpinner(`Updating subscriptions metadata... ${totalSubscriptions} subscriptions touched`);
            }

            if (subscriptions.data.length === 0) {
                break;
            }

            lastSubscriptionId = subscriptions.data[subscriptions.data.length - 1]?.id ?? null;
        }

        Logger.shared.succeed(`Finished`);
        Logger.shared.newline();

        reporter.print({});
        Logger.shared.newline();
    } catch (e) {
        Logger.shared.fail(e);

        Logger.shared.newline();
        stats.print();
        process.exit(1);
    }
}
