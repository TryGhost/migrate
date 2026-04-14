import {DatabaseSync} from 'node:sqlite';

export interface SqliteStatement<T = Record<string, unknown>> {
    all(...parameters: unknown[]): T[];
    run(...parameters: unknown[]): unknown;
}

export interface SqliteDatabase {
    exec(source: string): unknown;
    prepare<T = Record<string, unknown>>(source: string): SqliteStatement<T>;
    close(): void;
}

export interface SqliteReaderOptions {
    dbPath: string;
    timeoutMs?: number;
    readonly?: boolean;
    database?: SqliteDatabase;
}

export interface SqliteStreamRowsOptions {
    table: string;
    columns: string[];
    idColumn?: string;
    batchSize?: number;
    startAfterId?: number;
}

export type SqliteValue = string | number | boolean | null;

export interface SqliteUpdateRowOptions {
    table: string;
    id: string | number;
    values: Record<string, SqliteValue>;
    idColumn?: string;
}

export interface SqliteBatchUpdateRow {
    id: string | number;
    values: Record<string, SqliteValue>;
}

export interface SqliteBatchUpdateRowsOptions {
    table: string;
    rows: SqliteBatchUpdateRow[];
    idColumn?: string;
}

export type SqliteRow = Record<string, string>;

export class SqliteReader {
    readonly #database: SqliteDatabase;
    readonly #ownsDatabase: boolean;
    readonly #selectStatements = new Map<string, SqliteStatement<Record<string, unknown>>>();
    readonly #updateStatements = new Map<string, SqliteStatement>();

    constructor(options: SqliteReaderOptions) {
        if (!options.dbPath.trim()) {
            throw new Error('SqliteReader.dbPath must be a non-empty string');
        }

        if (options.database) {
            this.#database = options.database;
            this.#ownsDatabase = false;
            return;
        }

        const db = new DatabaseSync(options.dbPath, {
            readOnly: options.readonly ?? false
        });

        const timeoutMs = Math.round(options.timeoutMs ?? 5000);
        db.exec(`PRAGMA busy_timeout = ${timeoutMs}`);

        this.#database = db as unknown as SqliteDatabase;
        this.#ownsDatabase = true;
    }

    get database(): SqliteDatabase {
        return this.#database;
    }

    close(): void {
        if (this.#ownsDatabase) {
            this.#database.close();
        }
    }

    async configureForConcurrentAccess(): Promise<void> {
        this.#database.exec('PRAGMA journal_mode = WAL');
        this.#database.exec('PRAGMA synchronous = NORMAL');
    }

    async execute(sql: string): Promise<void> {
        this.#database.exec(sql);
    }

    async updateRowById(options: SqliteUpdateRowOptions): Promise<void> {
        this.#executeUpdateById(options.table, options.idColumn ?? 'id', options.id, options.values);
    }

    async updateRowsById(options: SqliteBatchUpdateRowsOptions): Promise<void> {
        if (options.rows.length === 0) {
            return;
        }

        let inTransaction = false;
        try {
            this.#database.exec('BEGIN');
            inTransaction = true;

            const idColumnName = options.idColumn ?? 'id';
            for (const row of options.rows) {
                this.#executeUpdateById(options.table, idColumnName, row.id, row.values);
            }

            this.#database.exec('COMMIT');
        } catch (error) {
            if (inTransaction) {
                try {
                    this.#database.exec('ROLLBACK');
                } catch (_rollbackError) {
                    // Ignore rollback failures; surface original error.
                }
            }
            throw error;
        }
    }

    async *streamRowsById(options: SqliteStreamRowsOptions): AsyncGenerator<SqliteRow> {
        const table = SqliteReader.#quoteIdentifier(options.table);
        const idColumnName = options.idColumn ?? 'id';
        const idColumn = SqliteReader.#quoteIdentifier(idColumnName);

        if (options.columns.length === 0) {
            throw new Error('SqliteReader.streamRowsById requires at least one selected column');
        }

        const selectedColumns: string[] = [];
        if (!options.columns.includes(idColumnName)) {
            selectedColumns.push(idColumnName);
        }
        for (const column of options.columns) {
            if (!selectedColumns.includes(column)) {
                selectedColumns.push(column);
            }
        }

        const columns = selectedColumns.map(column => SqliteReader.#quoteIdentifier(column));

        const batchSize = options.batchSize ?? 1000;
        if (!Number.isInteger(batchSize) || batchSize < 1) {
            throw new Error('SqliteReader.batchSize must be an integer greater than 0');
        }

        let lastSeenId = options.startAfterId ?? 0;
        if (!Number.isInteger(lastSeenId) || lastSeenId < 0) {
            throw new Error('SqliteReader.startAfterId must be an integer greater than or equal to 0');
        }

        const sql = `
            SELECT ${columns.join(', ')}
            FROM ${table}
            WHERE ${idColumn} > ?
            ORDER BY ${idColumn}
            LIMIT ?;
        `;

        const statementKey = `${options.table}:${idColumnName}:${selectedColumns.join(',')}`;
        let select = this.#selectStatements.get(statementKey);
        if (!select) {
            select = this.#database.prepare<Record<string, unknown>>(sql);
            this.#selectStatements.set(statementKey, select);
        }

        while (true) {
            const rows = select.all(lastSeenId, batchSize);
            if (rows.length === 0) {
                return;
            }

            for (const row of rows) {
                const idRaw = row[idColumnName];
                const idValue = Number(idRaw);
                if (!Number.isInteger(idValue) || idValue <= lastSeenId) {
                    throw new Error(`SqliteReader expected increasing integer IDs from "${idColumnName}"`);
                }

                lastSeenId = idValue;
                yield SqliteReader.#normalizeRow(row, selectedColumns);
            }
        }
    }

    #executeUpdateById(tableName: string, idColumnName: string, id: string | number, values: Record<string, SqliteValue>): void {
        const table = SqliteReader.#quoteIdentifier(tableName);
        const idColumn = SqliteReader.#quoteIdentifier(idColumnName);
        const updates = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));

        if (updates.length === 0) {
            throw new Error('SqliteReader.updateRowById requires at least one value');
        }

        const updateColumnNames = updates.map(([column]) => column);
        const statementKey = `${tableName}:${idColumnName}:${updateColumnNames.join(',')}`;

        let statement = this.#updateStatements.get(statementKey);
        if (!statement) {
            const assignments = updateColumnNames
                .map(column => `${SqliteReader.#quoteIdentifier(column)} = ?`)
                .join(', ');

            const sql = `
                UPDATE ${table}
                SET ${assignments}
                WHERE ${idColumn} = ?;
            `;

            statement = this.#database.prepare(sql);
            this.#updateStatements.set(statementKey, statement);
        }

        const parameters = updates.map(([, value]) => SqliteReader.#toParameter(value));
        parameters.push(id);
        statement.run(...parameters);
    }

    static #normalizeRow(row: Record<string, unknown>, columns: string[]): SqliteRow {
        const normalized: SqliteRow = {};

        for (const column of columns) {
            const value = row[column];
            if (value === null || value === undefined) {
                normalized[column] = '';
            } else {
                normalized[column] = String(value);
            }
        }

        return normalized;
    }

    static #quoteIdentifier(identifier: string): string {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
            throw new Error(`SqliteReader identifier "${identifier}" is invalid`);
        }

        return `"${identifier}"`;
    }

    static #toParameter(value: SqliteValue): string | number | null {
        if (typeof value === 'number' && !Number.isFinite(value)) {
            throw new Error('SqliteReader numeric value must be finite');
        }

        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }

        return value;
    }
}
