import Logger from '../Logger.js';
import {Options} from '../Options.js';

export class ImportStats {
    startedAt = Date.now();

    importedPerType: Map<string, number> = new Map();
    reusedPerType: Map<string, number> = new Map();
    confirmedPerType: Map<string, number> = new Map();
    revertedPerType: Map<string, number> = new Map();
    warnings: string[] = [];

    listeners: (() => void)[] = [];

    markStart() {
        this.startedAt = Date.now();
    }

    trackImported(type: string) {
        this.importedPerType.set(type, (this.importedPerType.get(type) || 0) + 1);
        this.callListeners();
    }

    trackReused(type: string) {
        this.reusedPerType.set(type, (this.reusedPerType.get(type) || 0) + 1);
        this.callListeners();
    }

    trackConfirmed(type: string) {
        this.confirmedPerType.set(type, (this.confirmedPerType.get(type) || 0) + 1);
        this.callListeners();
    }

    trackReverted(type: string) {
        this.revertedPerType.set(type, (this.revertedPerType.get(type) || 0) + 1);
        this.callListeners();
    }

    get totalImported() {
        return Array.from(this.importedPerType.values()).reduce((sum, count) => sum + count, 0);
    }

    get totalReused() {
        return Array.from(this.reusedPerType.values()).reduce((sum, count) => sum + count, 0);
    }

    get totalConfirmed() {
        return Array.from(this.confirmedPerType.values()).reduce((sum, count) => sum + count, 0);
    }

    get totalReverted() {
        return Array.from(this.revertedPerType.values()).reduce((sum, count) => sum + count, 0);
    }

    print() {
        const isDryRun = Options.shared.dryRun;
        const duration = (Date.now() - this.startedAt) / 1000;

        if (this.importedPerType.size === 0 && this.reusedPerType.size === 0 && this.confirmedPerType.size === 0 && this.revertedPerType.size === 0) {
            Logger.shared.info('No items affected');

            this.printWarnings();
            return;
        }

        if (this.totalConfirmed > 0) {
            Logger.shared.info(`Confirmed ${this.totalConfirmed} items:`);
            for (const [type, count] of this.confirmedPerType.entries()) {
                const perSecond = ((count) / duration).toFixed(2);
                Logger.shared.info(`- ${type}s: ${count} confirmed (${perSecond}/s)`);
            }
        }

        if (this.totalReverted > 0) {
            Logger.shared.info(`Reverted ${this.totalReverted} items:`);
            for (const [type, count] of this.revertedPerType.entries()) {
                const perSecond = ((count) / duration).toFixed(2);
                Logger.shared.info(`- ${type}s: ${count} reverted (${perSecond}/s)`);
            }
        }

        if (this.importedPerType.size !== 0 || this.reusedPerType.size !== 0) {
            Logger.shared.info(`${isDryRun ? 'Would have recreated' : 'Recreated'} ${this.totalImported} items:`);
            for (const [type, count] of this.importedPerType.entries()) {
                const reused = this.reusedPerType.get(type) || 0;

                // Calculate recreated/s
                const perSecond = ((count + reused) / duration).toFixed(2);
                Logger.shared.info(`- ${type}s: ${count} recreated, ${reused} reused (${perSecond}/s)`);
            }

            // Reused
            for (const [type, reused] of this.reusedPerType.entries()) {
                const imported = this.importedPerType.get(type) || 0;
                if (imported !== 0) {
                    continue;
                }

                const perSecond = ((reused) / duration).toFixed(2);
                Logger.shared.info(`- ${type}s: 0 recreated, ${reused} reused (${perSecond}/s)`);
            }
        }

        this.printWarnings();
    }

    printWarnings() {
        if (this.warnings.length > 0) {
            Logger.shared.newline();
            Logger.shared.warn(`With ${this.warnings.length} warning${this.warnings.length !== 1 ? 's' : ''}:`);
            for (const warning of this.warnings.slice(0, 15)) {
                Logger.shared.warn(`- ${warning}`);
            }
            if (this.warnings.length > 15) {
                Logger.shared.warn(`- ... and ${this.warnings.length - 15} more`);
            }
        }
    }

    toString() {
        const isDryRun = Options.shared.dryRun;
        const duration = (Date.now() - this.startedAt) / 1000;

        const arr: string[] = [];
        if (this.totalConfirmed > 0) {
            const perSecond = ((this.totalConfirmed) / duration).toFixed(2);
            arr.push(`confirmed ${this.totalConfirmed} items (${perSecond}/s)`);
        }

        if (this.totalReverted > 0) {
            const perSecond = ((this.totalReverted) / duration).toFixed(2);
            arr.push(`reverted ${this.totalReverted} items (${perSecond}/s)`);
        }

        if (this.totalImported > 0) {
            for (const [type, count] of this.importedPerType.entries()) {
                // Calculate recreated/s
                const perSecond = ((count) / duration).toFixed(2);
                arr.push(`${count} ${type}s recreated (${perSecond}/s)`);
            }
        }

        if (this.totalReused > 0) {
            for (const [type, count] of this.reusedPerType.entries()) {
                // Calculate recreated/s
                const perSecond = ((count) / duration).toFixed(2);
                arr.push(`${count} ${type}s reused (${perSecond}/s)`);
            }
        }

        if (arr.length === 0) {
            return 'No items affected';
        }
        return arr.join(', ');
    }

    addListener(listener: () => void) {
        this.listeners.push(listener);
    }

    callListeners() {
        for (const listener of this.listeners) {
            listener();
        }
    }

    addWarning(warning: string) {
        this.warnings.push(warning);
    }
}
