import {ui} from '@tryghost/pretty-cli';
import ora, {Ora} from 'ora';

export default class Logger {
    static shared: Logger;

    spinner: Ora | null = null;
    verbose: boolean;

    constructor({verbose}: {verbose?: boolean}) {
        this.verbose = verbose ?? false;
    }

    static init({verbose}: {verbose?: boolean}) {
        Logger.shared = new Logger({verbose});
    }

    startSpinner(text: string) {
        this.stopSpinner();
        this.spinner = ora(text).start();
    }

    processSpinner(text: string) {
        if (this.spinner) {
            this.spinner.text = text;
        }
    }

    stopSpinner() {
        if (this.spinner) {
            this.spinner.stop();
            this.spinner = null;
        }
    }

    fail(error: any) {
        if (this.spinner) {
            this.spinner.fail(error.toString() || error.message);
            this.spinner = null;
        } else {
            this.error(error.toString() || error.message);
        }
    }

    succeed(message: string) {
        if (this.spinner) {
            this.spinner.succeed(message);
            this.spinner = null;
        } else {
            this.ok(message);
        }
    }

    info(message: string) {
        if (!this.verbose) {
            return;
        }
        if (this.spinner) {
            this.spinner.clear()
        }

        ui.log.info(message);

        if (this.spinner) {
            this.spinner.render()
        }
    }

    ok(message: string) {
        if (this.spinner) {
            this.spinner.clear()
        }

        ui.log.ok(message);

        if (this.spinner) {
            this.spinner.render()
        }
    }

    error(message: string) {
        if (this.spinner) {
            this.spinner.clear()
        }
        ui.log.error(message);
        if (this.spinner) {
            this.spinner.render()
        }
    }
}
