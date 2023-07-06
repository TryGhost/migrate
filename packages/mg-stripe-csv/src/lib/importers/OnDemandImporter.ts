import {parse} from 'csv-parse';
import fs from 'fs';
import {StripeAPI} from '../StripeAPI.js';
import {Data} from '../decoders/Data.js';
import {Decoder} from '../decoders/Decoder.js';
import {ErrorGroup} from './ErrorGroup.js';
import {ImportError} from './ImportError.js';
import {ImportStats} from './ImportStats.js';
import Logger from '../Logger.js';

/**
 * Context we need to have when importing a coupon, for error logging and data handling.
 */
export type ImportContext = {
    stripe: StripeAPI,
    dryRun: boolean,
    stats: ImportStats,
    verbose: boolean
}

export type LineData = {
    id: string
}

/**
 * Reads and validates all data in a CSV file, but only imports data into Stripe on demand by id, when it is referenced by another importer.
 */
export class OnDemandImporter<T extends LineData = any> {
    filePath: string;
    didReadAll: boolean = false;

    /**
     * This map keeps track of all the imported lines, and maps the old id to the new id.
     */
    imported: Map<string, string> = new Map();

    /**
     * Data read from the CSV file that is not yet used. Mapped by the old id.
     */
    itemName: string;
    queue: Map<string, T> = new Map();
    decoder: Decoder<T>;
    importLine: (line: T, context: ImportContext) => Promise<string>;

    constructor(options: {
        itemName: string,
        filePath: string,
        decoder: Decoder<T>,
        importLine: (line: T, context: ImportContext) => Promise<string>
    }) {
        this.itemName = options.itemName;
        this.filePath = options.filePath;
        this.decoder = options.decoder;
        this.importLine = options.importLine;
    }

    didImport(oldId: string): boolean {
        return this.imported.has(oldId);
    }

    async importIfNeeded(oldId: string, context: ImportContext): Promise<string> {
        if (this.didImport(oldId)) {
            return this.imported.get(oldId)!;
        }

        const id = await this.import(oldId, context);
        this.imported.set(oldId, id);
        return id;
    }

    private async import(oldId: string, context: ImportContext): Promise<string> {
        await this.readAllIfNeeded(context);
        const line = this.queue.get(oldId);
        if (line === undefined) {
            throw new Error(`${this.itemName} with ID ${oldId} does not exist`);
        }

        return await this.doImportLine(line, context);
    }

    async doImportLine(line: T, context: ImportContext): Promise<string> {
        Logger.shared.info(`Importing ${this.itemName} ${line.id}`);

        try {
            const id = await this.importLine(line, context);
            this.imported.set(line.id, id);
            return id;
        } catch (e: any) {
            throw new ImportError({
                message: `Failed to import ${this.itemName} ${line.id}`,
                filePath: this.filePath,
                line: 0,
                cause: e
            })
        }
    }

    async readAllIfNeeded(context: ImportContext): Promise<void> {
        if (this.didReadAll) {
            return Promise.resolve();
        }
        return await this.readAll(context);
    }

    /**
     * If ever needed, we could rewrite this to not read all lines at once to minimize memory usage.
     */
    async readAll(context: ImportContext): Promise<void> {
        if (this.didReadAll) {
            return Promise.resolve();
        }
        this.didReadAll = true;

        // Initialize the parser
        return new Promise((resolve, reject) => {
            const parser = parse({
                columns: (header: string[]) => {
                    return header.map((column: string) => column.toLowerCase())
                }
            });
            const fileStream = fs.createReadStream(this.filePath);
            fileStream.pipe(parser);

            const errors = new ErrorGroup();

            (async () => {
                // Iterate through each records
                let lineNumber = 1;

                for await (const record of parser) {
                    context.stats.trackRead(this.itemName);
                    lineNumber++;
                    try {
                        const data = new Data(record);
                        const parsed = this.decoder.decode(data);
                        this.queue.set(parsed.id, parsed);
                    } catch (e: any) {
                        const error = new ImportError({
                            message: `Failed to read ${this.itemName}`,
                            filePath: this.filePath,
                            line: lineNumber,
                            cause: e
                        })
                        errors.add(error);
                    }
                }
                errors.throwIfNotEmpty();
            })().then(resolve).catch(reject);
        });
    }
}
