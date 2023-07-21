import {Logger} from './Logger.js';
import input from '@inquirer/input';
import chalk from 'chalk';

export class DelayPrompt {
    async ask(delayOpt?: number | null): Promise<number> {
        if (delayOpt && Number.isInteger(delayOpt) && delayOpt >= 1) {
            return delayOpt;
        }

        Logger.shared.info(`We recommend ${chalk.cyan('delaying payment collection')} from Stripe until the copy is finished, to avoid duplicate charges.`);
        Logger.shared.info(`As a rule of thumb, copying 10,000 subscriptions takes roughly an hour. We suggest adding an hour of buffer time to be safe.`);

        const delayInput = await input({
            message: 'For how many hours would you like to pause payment collection?'
        });

        const delay = parseInt(delayInput, 10);

        if (!Number.isInteger(delay) || delay < 1) {
            Logger.shared.fail('Expected a delay in payment collection of at least 1 hour.');
            process.exit(1);
        }

        return delay;
    }
}
