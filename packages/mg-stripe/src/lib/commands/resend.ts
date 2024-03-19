import {confirm as _confirm} from '@inquirer/prompts';
import chalk from 'chalk';
import {Logger} from '../Logger.js';
import {Options} from '../Options.js';
import {StripeConnector} from '../StripeConnector.js';
import {ImportStats} from '../importers/ImportStats.js';
import {Reporter, ReportingCategory} from '../importers/Reporter.js';
import util from 'util';
import Stripe from 'stripe';
import {exec as _exec} from 'child_process';
const exec = util.promisify(_exec);

export async function resend(options: Options) {
    const stats = new ImportStats();
    const reporter = new Reporter(new ReportingCategory(''));

    Logger.shared.info(`The ${chalk.cyan('resend')} command will resend pending webhook events`);
    Logger.shared.newline();

    Logger.shared.startSpinner('');
    if (options.dryRun) {
        Logger.shared.succeed(`Running ${chalk.green('resend')} command as ${chalk.green('DRY RUN')}. No Stripe data will be updated.`);
    } else {
        Logger.shared.succeed(`Running ${chalk.green('resend')} command...`);
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
            Logger.shared.fail('Resend cancelled');
            process.exit(1);
        }
        stats.markStart();

        // Step 2: Import data
        Logger.shared.startSpinner('Resending webhooks...');
        stats.addListener(() => {
            Logger.shared.processSpinner(stats.toString());
        });

        const endpoints = await fromAccount.use((client) => {
            return client.webhookEndpoints.list({
                limit: 100
            });
        });

        let endpoint: Stripe.WebhookEndpoint|null = null;

        for (const e of endpoints.data) {
            if (e.url.endsWith('/members/webhooks/stripe/') && e.enabled_events && e.livemode === (mode === 'live')) {
                if (endpoint) {
                    Logger.shared.fail('Multiple suitable webhook endpoints found from Ghost');
                    process.exit(1);
                }
                endpoint = e;
            }
        }

        if (!endpoint) {
            Logger.shared.fail('No suitable webhook endpoint found from Ghost');

            for (const e of endpoints.data) {
                Logger.shared.info(`Endpoint: ${e.url}`);
            }
            process.exit(1);
        }

        let totalEvents = 0;

        let eventSet = new Set<string>();

        while (true) {
            const events = await fromAccount.use((client) => {
                return client.events.list({
                    delivery_success: false,
                    limit: 100
                });
            });

            let called = 0;

            for (const event of events.data) {
                if (eventSet.has(event.id)) {
                    Logger.shared.warn(`Failed to resend event ${event.id} - still failed after resending`);
                    continue;
                }
                eventSet.add(event.id);
                called += 1;
                if (!options.dryRun) {
                    const command = `stripe events resend ${event.id} --api-key ${fromAccount.getKey()} --webhook-endpoint=${endpoint.id}`;
                    await exec(command);

                    // Wait 1s
                    await new Promise((r) => {
                        setTimeout(r, 1000);
                    });
                }

                totalEvents += 1;
                Logger.shared.processSpinner(`Resending webhooks... ${totalEvents} fired`);
            }

            if (events.data.length === 0) {
                break;
            }

            if (called === 0) {
                Logger.shared.warn('Failed to resend all events in a page. Stopping to avoid infinite loop');
                break;
            }
        }

        Logger.shared.succeed(`Finished. ${totalEvents} webhooks resent`);
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
