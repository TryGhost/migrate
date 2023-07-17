import Logger from '../Logger.js';
import {Options} from '../Options.js';

export class ImportStats {
    importedPerType: Map<string, number> = new Map();
    reusedPerType: Map<string, number> = new Map();

    listeners: (() => void)[] = [];

    trackImported(type: string) {
        this.importedPerType.set(type, (this.importedPerType.get(type) || 0) + 1);
        this.callListeners();
    }

    trackReused(type: string) {
        this.reusedPerType.set(type, (this.reusedPerType.get(type) || 0) + 1);
        this.callListeners();
    }

    get totalImported() {
        return Array.from(this.importedPerType.values()).reduce((sum, count) => sum + count, 0);
    }

    get totalReused() {
        return Array.from(this.reusedPerType.values()).reduce((sum, count) => sum + count, 0);
    }

    print() {
        const isDryRun = Options.shared.dryRun;
        if (this.importedPerType.size === 0) {
            Logger.shared.info('No items imported');
            return;
        }

        Logger.shared.info(`${isDryRun ? 'Would have recreated' : 'Recreated'} ${this.totalImported} items:`);
        for (const [type, count] of this.importedPerType.entries()) {
            const reused = this.reusedPerType.get(type) || 0;
            Logger.shared.info(`- ${type}s: ${count} recreated, ${reused} reused`);
        }
    }

    toString() {
        const isDryRun = Options.shared.dryRun;
        if (this.importedPerType.size === 0) {
            return 'No items recreated';
        }
        return `${isDryRun ? 'Would have recreated' : 'Recreated'} ${this.totalImported} items, reused ${this.totalReused}`;
    }

    addListener(listener: () => void) {
        this.listeners.push(listener);
    }

    callListeners() {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
