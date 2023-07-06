import {ui} from '@tryghost/pretty-cli';
import ora, {Ora} from 'ora';

class VerboseLogger {
    logger: Logger
    level: 0 | 1 | 2 = 0;
    get verboseLevel() {
        return this.logger.verboseLevel;
    }

    constructor({logger, level}: {logger: Logger, level?: 0 | 1 | 2}) {
        this.logger = logger;
        this.level = level ?? 0;
    }

    get activated() {
        return this.verboseLevel >= this.level;
    }

    info(message: string) {
        if (!this.activated) {
            return;
        }
        this.logger.info(message);
    }

    ok(message: string, level = 0) {
        if (!this.activated) {
            return;
        }
        this.logger.ok(message);
    }

    error(message: string, level = 0) {
        if (!this.activated) {
            return;
        }
        this.logger.error(message);
    }
}

export default class Logger {
    static shared: Logger;
    static v: VerboseLogger
    static vv: VerboseLogger

    spinner: Ora | null = null;
    verboseLevel: 0 | 1 | 2 = 0;

    constructor({verboseLevel}: {verboseLevel?: 0 | 1 | 2}) {
        this.verboseLevel = verboseLevel ?? 0;
    }

    static init({verboseLevel}: {verboseLevel?: 0 | 1 | 2}) {
        const logger = new Logger({verboseLevel});
        Logger.shared = logger;
        Logger.v = new VerboseLogger({logger, level: 1});
        Logger.vv = new VerboseLogger({logger, level: 2});
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

    info(message: string, level = 2) {
        if (this.spinner) {
            this.spinner.clear()
        }

        ui.log.info(message);

        if (this.spinner) {
            this.spinner.render()
        }
    }

    ok(message: string, level = 0) {
        if (this.spinner) {
            this.spinner.clear()
        }

        ui.log.ok(message);

        if (this.spinner) {
            this.spinner.render()
        }
    }

    error(message: string, level = 0) {
        if (this.spinner) {
            this.spinner.clear()
        }
        ui.log.error(message);
        if (this.spinner) {
            this.spinner.render()
        }
    }
}
