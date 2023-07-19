import Logger from '../Logger.js';
import {Options} from '../Options.js';

export class ImportStats {
    importedPerType: Map<string, number> = new Map();
    reusedPerType: Map<string, number> = new Map();
    confirmedPerType: Map<string, number> = new Map();
    revertedPerType: Map<string, number> = new Map();
    warnings: string[] = [];

    listeners: (() => void)[] = [];

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

        if (this.totalConfirmed > 0) {
            Logger.shared.info(`Confirmed ${this.totalConfirmed} items:`);
            for (const [type, count] of this.confirmedPerType.entries()) {
                Logger.shared.info(`- ${type}s: ${count} confirmed`);
            }
        }

        if (this.totalReverted > 0) {
            Logger.shared.info(`Reverted ${this.totalReverted} items:`);
            for (const [type, count] of this.revertedPerType.entries()) {
                Logger.shared.info(`- ${type}s: ${count} reverted`);
            }
        }

        if (this.importedPerType.size === 0 && this.reusedPerType.size === 0 && this.confirmedPerType.size === 0 && this.revertedPerType.size === 0) {
            Logger.shared.info('No items imported');
            return;
        }

        if (this.importedPerType.size !== 0 || this.reusedPerType.size !== 0) {
            Logger.shared.info(`${isDryRun ? 'Would have recreated' : 'Recreated'} ${this.totalImported} items:`);
            for (const [type, count] of this.importedPerType.entries()) {
                const reused = this.reusedPerType.get(type) || 0;
                Logger.shared.info(`- ${type}s: ${count} recreated, ${reused} reused`);
            }

            // Reused
            for (const [type, reused] of this.reusedPerType.entries()) {
                const imported = this.importedPerType.get(type) || 0;
                if (imported !== 0) {
                    continue;
                }
                Logger.shared.info(`- ${type}s: 0 recreated, ${reused} reused`);
            }
        }
    }

    toString() {
        const isDryRun = Options.shared.dryRun;

        const arr: string[] = [];
        if (this.totalConfirmed > 0) {
            arr.push(`confirmed ${this.totalConfirmed} items`);
        }

        if (this.totalReverted > 0) {
            arr.push(`reverted ${this.totalReverted} items`);
        }

        if (this.totalImported > 0) {
            arr.push(`${isDryRun ? 'would have recreated' : 'recreated'} ${this.totalImported} items`);
        }

        if (this.totalReused > 0) {
            arr.push(`reused ${this.totalReused} items`);
        }

        if (arr.length === 0) {
            return 'No items recreated';
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
