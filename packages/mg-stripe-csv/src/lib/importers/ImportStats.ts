import Logger from '../Logger.js';

export class ImportStats {
    readPerType: Map<string, number> = new Map();
    importedPerType: Map<string, number> = new Map();
    reusedPerType: Map<string, number> = new Map();

    listeners: (() => void)[] = []

    trackRead(type: string) {
        this.readPerType.set(type, (this.readPerType.get(type) || 0) + 1);
        this.callListeners();
    }

    trackImported(type: string) {
        this.importedPerType.set(type, (this.importedPerType.get(type) || 0) + 1);
        this.callListeners();
    }

    trackReused(type: string) {
        this.reusedPerType.set(type, (this.reusedPerType.get(type) || 0) + 1);
        this.callListeners();
    }

    get total() {
        return Array.from(this.importedPerType.values()).reduce((sum, count) => sum + count, 0);
    }

    print() {
        Logger.shared.info(`Imported ${this.total} items:`);
        for (const [type, count] of this.importedPerType.entries()) {
            const reused = this.reusedPerType.get(type) || 0;
            const read = this.readPerType.get(type) || 0;
            const skipped = read - count - reused;
            Logger.shared.info(`  ${type}: ${count} imported, ${reused} reused, ${skipped} skipped`);
        }
    }

    toString() {
        return `Imported ${this.total} items`;
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
