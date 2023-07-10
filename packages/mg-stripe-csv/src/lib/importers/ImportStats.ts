import Logger from '../Logger.js';

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
        Logger.shared.info(`Imported ${this.totalImported} items:`);
        for (const [type, count] of this.importedPerType.entries()) {
            const reused = this.reusedPerType.get(type) || 0;
            Logger.shared.info(`  ${type}: ${count} imported, ${reused} reused`);
        }
    }

    toString() {
        return `Imported ${this.totalImported} items, reused ${this.totalReused}`;
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
