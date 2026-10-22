import errors from '@tryghost/errors';
import {assertMappedWrite, type DatabaseModels} from './database.js';
import {withTransaction} from './db-helpers.js';
import {serializeMetadata, type JsonObject} from './json.js';

export interface SourceRecordInput {
    kind: string;
    key?: string | null;
    content: string;
    format: string;
    metadata?: JsonObject;
}

export interface SourceRecord {
    readonly id: number;
    readonly kind: string;
    readonly key: string | null;
    readonly content: string;
    readonly format: string;
    readonly metadata: JsonObject;
}

export interface IngestionInfo {
    id: number;
    metadata: JsonObject;
    startedAt: string;
    completedAt: string;
}

export interface SourceIterationOptions {
    kind?: string;
    batchSize?: number;
}

export interface SourceWriteOptions {
    onDuplicate?: 'error' | 'keep' | 'replace';
}

export interface SourceBatchOptions extends SourceWriteOptions {
    batchSize?: number;
    maxBatchBytes?: number;
}

export interface IngestOptions {
    replace?: boolean;
    metadata?: JsonObject;
}

export interface SourceEntity {
    type: 'post' | 'tag' | 'author';
    id: number;
}

type Row = Record<string, any>;

function positive(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new errors.BadRequestError({message: 'Batch limits must be positive safe integers.'});
    }
}

function hydrate(row: Row): SourceRecord {
    return {
        id: row.id,
        kind: row.kind,
        key: row.lookup_key,
        content: row.content,
        format: row.format,
        metadata: JSON.parse(row.metadata)
    };
}

interface PreparedSourceRecord {
    kind: string;
    key: string | null;
    content: string;
    format: string;
    metadata: string;
}

function prepareRecord(input: SourceRecordInput): PreparedSourceRecord {
    const kind = input?.kind;
    const key = input?.key ?? null;
    const content = input?.content;
    const format = input?.format;
    if (
        typeof kind !== 'string' ||
        !kind.trim() ||
        typeof format !== 'string' ||
        !format.trim() ||
        typeof content !== 'string' ||
        (key !== null && (typeof key !== 'string' || !key.trim()))
    ) {
        throw new errors.BadRequestError({
            message: 'Source records require kind, format, text content, and a nonblank key when supplied.'
        });
    }
    return {kind, key, content, format, metadata: serializeMetadata(input.metadata)};
}

/** A view over either completed data or one private staging generation. */
class RecordReader {
    #database: () => DatabaseModels;
    #generation: () => number | null;

    constructor(database: () => DatabaseModels, generation: () => number | null) {
        this.#database = database;
        this.#generation = generation;
    }

    protected get models(): DatabaseModels {
        return this.#database();
    }

    protected get generation(): number | null {
        return this.#generation();
    }

    get(kind: string, key: string): SourceRecord | null {
        const row = this.models.db
            .prepare('SELECT * FROM SourceRecords WHERE ingestion_id = ? AND kind = ? AND lookup_key = ?')
            .get(this.generation, kind, key) as Row | undefined;
        return row ? hydrate(row) : null;
    }

    getById(id: number): SourceRecord | null {
        const row = this.models.db
            .prepare('SELECT * FROM SourceRecords WHERE ingestion_id = ? AND id = ?')
            .get(this.generation, id) as Row | undefined;
        return row ? hydrate(row) : null;
    }

    count(kind?: string): number {
        const condition = kind === undefined ? '' : ' AND kind = ?';
        const params = kind === undefined ? [this.generation] : [this.generation, kind];
        return (
            this.models.db
                .prepare(`SELECT COUNT(*) AS count FROM SourceRecords WHERE ingestion_id = ?${condition}`)
                .get(...params) as {count: number}
        ).count;
    }

    async *records({kind, batchSize = 25}: SourceIterationOptions = {}): AsyncGenerator<SourceRecord> {
        positive(batchSize);
        const generation = this.generation;
        const params = kind === undefined ? [generation] : [generation, kind];
        const query = this.models.db.prepare(
            `SELECT * FROM SourceRecords WHERE ingestion_id = ?${kind === undefined ? '' : ' AND kind = ?'} AND id > ? AND id <= ? ORDER BY id LIMIT ?`
        );
        const upper = (
            this.models.db
                .prepare('SELECT MAX(id) AS upper FROM SourceRecords WHERE ingestion_id = ?')
                .get(generation) as {upper: number | null}
        ).upper;
        let after = 0;
        while (upper !== null && after < upper) {
            // Revalidate the handle before each fetch; closed staging handles cannot leak data.
            if (this.generation !== generation) {
                throw new errors.InternalServerError({message: 'Source data changed during iteration.'});
            }
            const rows = query.all(...params, after, upper, batchSize) as Row[];
            if (rows.length === 0) {
                break;
            }
            for (const row of rows) {
                if (this.generation !== generation) {
                    throw new errors.InternalServerError({message: 'Source data changed during iteration.'});
                }
                after = row.id;
                yield hydrate(row);
            }
        }
    }
}

/** Only available inside an ingestion callback; completed records have no write API. */
export class SourceIngestion extends RecordReader {
    #id: number;
    #assertOpen: () => void;

    constructor(database: () => DatabaseModels, id: number, assertOpen: () => void) {
        super(database, () => {
            assertOpen();
            return id;
        });
        this.#id = id;
        this.#assertOpen = assertOpen;
    }

    #put(input: PreparedSourceRecord, {onDuplicate = 'error'}: SourceWriteOptions): SourceRecord {
        this.#assertOpen();
        if (!['error', 'keep', 'replace'].includes(onDuplicate)) {
            throw new errors.BadRequestError({message: 'Unknown source duplicate policy.'});
        }
        const existing = input.key === null ? null : this.get(input.kind, input.key);
        if (existing) {
            if (onDuplicate === 'error') {
                throw new errors.BadRequestError({message: `Duplicate source record: ${input.kind}/${input.key}.`});
            }
            if (onDuplicate === 'keep') {
                return existing;
            }
            this.models.db
                .prepare('UPDATE SourceRecords SET content = ?, format = ?, metadata = ? WHERE id = ?')
                .run(input.content, input.format, input.metadata, existing.id);
            return {
                ...existing,
                content: input.content,
                format: input.format,
                metadata: JSON.parse(input.metadata)
            };
        }
        const result = this.models.db
            .prepare(
                'INSERT INTO SourceRecords(ingestion_id, kind, lookup_key, content, format, metadata) VALUES (?, ?, ?, ?, ?, ?)'
            )
            .run(this.#id, input.kind, input.key, input.content, input.format, input.metadata);
        return {
            id: Number(result.lastInsertRowid),
            kind: input.kind,
            key: input.key,
            content: input.content,
            format: input.format,
            metadata: JSON.parse(input.metadata)
        };
    }

    put(input: SourceRecordInput, options: SourceWriteOptions = {}): SourceRecord {
        this.#assertOpen();
        const record = prepareRecord(input);
        return withTransaction(this.models, () => this.#put(record, options));
    }

    async write(
        input: AsyncIterable<SourceRecordInput> | Iterable<SourceRecordInput>,
        {batchSize = 250, maxBatchBytes = 4 * 1024 * 1024, ...policy}: SourceBatchOptions = {}
    ): Promise<number> {
        this.#assertOpen();
        positive(batchSize);
        positive(maxBatchBytes);
        let batch: PreparedSourceRecord[] = [];
        let bytes = 0;
        let written = 0;
        const flush = () => {
            withTransaction(this.models, () => {
                for (const record of batch) {
                    this.#put(record, policy);
                }
            });
            written += batch.length;
            batch = [];
            bytes = 0;
        };
        for await (const value of input) {
            this.#assertOpen();
            const record = prepareRecord(value);
            const size =
                Buffer.byteLength(record.content) +
                Buffer.byteLength(record.metadata) +
                Buffer.byteLength(record.kind) +
                Buffer.byteLength(record.format) +
                Buffer.byteLength(record.key ?? '');
            if (batch.length && bytes + size > maxBatchBytes) {
                flush();
            }
            batch.push(record);
            bytes += size;
            if (batch.length >= batchSize || bytes >= maxBatchBytes) {
                flush();
            }
        }
        if (batch.length) {
            flush();
        }
        return written;
    }

    recordDiagnostic(type: string, details: JsonObject = {}, sourceRecordId?: number): void {
        this.#assertOpen();
        if (!type.trim() || (sourceRecordId !== undefined && !this.getById(sourceRecordId))) {
            throw new errors.BadRequestError({message: 'Diagnostic requires a type and a record from this ingestion.'});
        }
        this.models.db
            .prepare(
                "INSERT INTO MigrationEvents(type, details, created_at, phase, ingestion_id, source_record_id) VALUES (?, ?, ?, 'ingestion', ?, ?)"
            )
            .run(type, serializeMetadata(details), new Date().toISOString(), this.#id, sourceRecordId ?? null);
    }
}

/** Caller-controlled source storage; identity and refresh policy belong to the caller. */
export default class SourceRecords extends RecordReader {
    #database: () => DatabaseModels;
    #resetMapped: () => void;
    #activeAttempt: number | null = null;
    #state: {closed: boolean};

    constructor(database: () => DatabaseModels, resetMapped: () => void) {
        const state = {closed: false};
        const currentDatabase = () => {
            if (state.closed) {
                throw new errors.InternalServerError({message: 'Source store is closed.'});
            }
            return database();
        };
        super(currentDatabase, () => {
            const row = currentDatabase()
                .db.prepare("SELECT id FROM SourceIngestions WHERE status = 'complete'")
                .get() as {id: number} | undefined;
            return row?.id ?? null;
        });
        this.#state = state;
        this.#database = currentDatabase;
        this.#resetMapped = resetMapped;
    }

    get hasCompletedIngestion(): boolean {
        return this.generation !== null;
    }

    get currentIngestion(): IngestionInfo | null {
        const row = this.models.db.prepare("SELECT * FROM SourceIngestions WHERE status = 'complete'").get() as
            | Row
            | undefined;
        return row
            ? {id: row.id, metadata: JSON.parse(row.metadata), startedAt: row.started_at, completedAt: row.completed_at}
            : null;
    }

    assertIdle(): void {
        if (this.#activeAttempt !== null) {
            throw new errors.InternalServerError({message: 'Source ingestion and mapped transactions cannot overlap.'});
        }
    }

    async ingest(
        {replace = false, metadata}: IngestOptions,
        callback: (stage: SourceIngestion) => void | Promise<void>
    ): Promise<IngestionInfo> {
        this.assertIdle();
        if (this.models.inTransaction) {
            throw new errors.InternalServerError({message: 'Ingestion cannot run inside a mapped transaction.'});
        }
        if (typeof replace !== 'boolean' || typeof callback !== 'function') {
            throw new errors.BadRequestError({message: 'Ingestion requires a callback and boolean replace option.'});
        }
        if (this.hasCompletedIngestion && !replace) {
            throw new errors.BadRequestError({
                message: 'Completed source data already exists; explicitly request replacement.'
            });
        }
        const encoded = serializeMetadata(metadata);
        const db = this.models;
        withTransaction(db, () => {
            for (const row of db.db
                .prepare("SELECT id FROM SourceIngestions WHERE status = 'staging'")
                .iterate() as Iterable<{id: number}>) {
                this.#fail(row.id, 'Interrupted ingestion discarded; restart from the beginning.');
            }
        });
        const result = db.db
            .prepare("INSERT INTO SourceIngestions(status, metadata, started_at) VALUES ('staging', ?, ?)")
            .run(encoded, new Date().toISOString());
        const id = Number(result.lastInsertRowid);
        this.#activeAttempt = id;
        db.ingestionActive = true;
        const stage = new SourceIngestion(this.#database, id, () => {
            if (this.#activeAttempt !== id || this.#state.closed) {
                throw new errors.InternalServerError({message: 'Ingestion handle is closed.'});
            }
        });
        try {
            await callback(stage);
            if (this.#state.closed) {
                throw new errors.InternalServerError({message: 'Context closed during ingestion.'});
            }
            db.ingestionActive = false;
            withTransaction(db, () => {
                this.#resetMapped();
                db.db.prepare("UPDATE SourceIngestions SET status = 'retired' WHERE status = 'complete'").run();
                db.db
                    .prepare("UPDATE SourceIngestions SET status = 'complete', completed_at = ? WHERE id = ?")
                    .run(new Date().toISOString(), id);
                db.db.prepare('DELETE FROM SourceRecords WHERE ingestion_id <> ?').run(id);
            });
        } catch (error) {
            if (!this.#state.closed) {
                withTransaction(db, () => this.#fail(id, String(error)));
            }
            throw error;
        } finally {
            db.ingestionActive = false;
            this.#activeAttempt = null;
        }
        return this.currentIngestion!;
    }

    #fail(id: number, message: string): void {
        const db = this.models;
        db.db.prepare('DELETE FROM SourceRecords WHERE ingestion_id = ?').run(id);
        db.db
            .prepare("UPDATE SourceIngestions SET status = 'failed', completed_at = ? WHERE id = ?")
            .run(new Date().toISOString(), id);
        db.db
            .prepare(
                "INSERT INTO MigrationEvents(type, details, created_at, phase, ingestion_id) VALUES ('source:failed', ?, ?, 'ingestion', ?)"
            )
            .run(JSON.stringify({message}), new Date().toISOString(), id);
    }

    close(): void {
        try {
            if (this.#activeAttempt !== null) {
                withTransaction(this.models, () =>
                    this.#fail(this.#activeAttempt!, 'Context closed during ingestion.')
                );
            }
        } finally {
            this.#activeAttempt = null;
            this.#state.closed = true;
        }
    }

    #entity(entity: SourceEntity): string {
        const table = {post: 'Posts', tag: 'Tags', author: 'Authors'}[entity.type];
        if (
            !table ||
            !Number.isSafeInteger(entity.id) ||
            !this.models.db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(entity.id)
        ) {
            throw new errors.BadRequestError({message: 'Provenance requires an existing post, tag, or author.'});
        }
        return table;
    }

    link(recordId: number, entity: SourceEntity): void {
        assertMappedWrite(this.models);
        this.#entity(entity);
        if (!this.getById(recordId)) {
            throw new errors.BadRequestError({message: 'Provenance requires a completed source record.'});
        }
        this.models.db
            .prepare('INSERT OR IGNORE INTO SourceEntityLinks VALUES (?, ?, ?)')
            .run(recordId, entity.type, entity.id);
    }

    unlink(recordId: number, entity: SourceEntity): void {
        assertMappedWrite(this.models);
        this.models.db
            .prepare('DELETE FROM SourceEntityLinks WHERE source_record_id = ? AND entity_type = ? AND entity_id = ?')
            .run(recordId, entity.type, entity.id);
    }

    async *recordsFor(entity: SourceEntity, {batchSize = 25}: {batchSize?: number} = {}): AsyncGenerator<SourceRecord> {
        this.#entity(entity);
        positive(batchSize);
        const generation = this.generation;
        let after = 0;
        while (true) {
            const rows = this.models.db
                .prepare(
                    'SELECT r.* FROM SourceEntityLinks l JOIN SourceRecords r ON r.id = l.source_record_id WHERE l.entity_type = ? AND l.entity_id = ? AND r.id > ? ORDER BY r.id LIMIT ?'
                )
                .all(entity.type, entity.id, after, batchSize) as Row[];
            if (!rows.length) {
                break;
            }
            for (const row of rows) {
                if (this.generation !== generation) {
                    throw new errors.InternalServerError({message: 'Source data changed during iteration.'});
                }
                after = row.id;
                yield hydrate(row);
            }
        }
    }

    async *entitiesFor(recordId: number, {batchSize = 25}: {batchSize?: number} = {}): AsyncGenerator<SourceEntity> {
        positive(batchSize);
        const generation = this.generation;
        let after = 0;
        while (true) {
            const rows = this.models.db
                .prepare(
                    'SELECT rowid AS cursor, entity_type, entity_id FROM SourceEntityLinks WHERE source_record_id = ? AND rowid > ? ORDER BY rowid LIMIT ?'
                )
                .all(recordId, after, batchSize) as Row[];
            if (!rows.length) {
                break;
            }
            for (const row of rows) {
                if (this.generation !== generation) {
                    throw new errors.InternalServerError({message: 'Source data changed during iteration.'});
                }
                after = row.cursor;
                yield {type: row.entity_type, id: row.entity_id};
            }
        }
    }
}
