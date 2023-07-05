import {OnDemandImporter, ImportContext, LineData} from './OnDemandImporter.js';

/**
 * Imports all CSV lines one by one
 */
export class FullImporter<T extends LineData = LineData> extends OnDemandImporter<T> {
    /**
     * If ever needed, we could rewrite this to not read all lines at once to minimize memory usage.
     */
    async importAll(context: ImportContext): Promise<void> {
        await this.readAllIfNeeded(context)
        for (const [, line] of this.queue) {
            await this.doImportLine(line, context);
        }
    }
}
