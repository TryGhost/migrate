import {stat, mkdir, mkdtemp, rename, rm, writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import errors from '@tryghost/errors';

import MigrateBase from './MigrateBase.js';
import SourceRecords, {type SourceRecord} from './SourceRecords.js';
import {RecordDataError, WARNING_EVENT_TYPES, type MappingSummary, type RecordMapper} from './mapping.js';
import {writeGhostJson} from './ghost-json.js';
import {writeMigrationReport} from './migration-report.js';
import {exportBaseFilename} from './export-filename.js';
import {serializeMetadata, type JsonObject} from './json.js';
import PostContext, {
    PostConstructorOptions,
    normalizeTitle,
    type DuplicatePostPolicy,
    type PostDataPatch,
    type PostSnapshot
} from './PostContext.js';
import TagContext from './TagContext.js';
import AuthorContext from './AuthorContext.js';
import {GHOST_CSV_COLUMNS, csvLine, csvPostLine, type CsvPostRelations} from './ghost-csv.js';
import {
    createDatabase,
    assertMappedWrite,
    flushDatabaseEvents,
    recordSanitizedFields,
    type DatabaseEvent,
    type DatabaseModels,
    type MigrationEventType,
    type SanitizedField
} from './database.js';
import {withTransaction, buildDateWhere, countWhere, findPostsWhere} from './db-helpers.js';

type FindPostsOptions = {
    slug?: string;
    title?: string;
    tagSlug?: string;
    tagName?: string;
    authorSlug?: string;
    authorName?: string;
    authorEmail?: string;
};

export type FindTagsOptions = {
    slug?: string;
    name?: string;
    scope?: EntityScope;
};

export type FindAuthorsOptions = {
    slug?: string;
    name?: string;
    email?: string;
    scope?: EntityScope;
};

export type EntityScope = 'referenced' | 'all';

export interface EntityIterationOptions {
    batchSize?: number;
    scope?: EntityScope;
}

export interface WrittenFile {
    path: string;
    name: string;
    size: number;
    posts: number;
}

export interface ProgressEvent {
    operation: string;
    processed: number;
    total: number;
}

export interface PostSkippedEvent {
    lookupKey: string;
    existingPostId: number;
}

export interface PostReplacedEvent {
    lookupKey: string;
    postId: number;
    previous: PostSnapshot;
    current: PostSnapshot;
}

export type SanitizedFieldEvent = SanitizedField;

export interface SlugRenamedEvent {
    postId: number;
    lookupKey: string | null;
    oldSlug: string;
    newSlug: string;
    url: string;
}

export type ExportFileWrittenEvent = WrittenFile;

export interface MigrateContextEventMap {
    progress: ProgressEvent;
    'post:skipped': PostSkippedEvent;
    'post:replaced': PostReplacedEvent;
    'field:sanitized': SanitizedFieldEvent;
    'slug:renamed': SlugRenamedEvent;
    'export:file-written': ExportFileWrittenEvent;
}

export interface PostFilter {
    tag?: {slug?: string; name?: string};
    author?: {slug?: string; name?: string; email?: string};
    createdAt?: {before?: Date; after?: Date; onOrBefore?: Date; onOrAfter?: Date};
    publishedAt?: {before?: Date; after?: Date; onOrBefore?: Date; onOrAfter?: Date};
}

export interface ForEachPostOptions {
    batchSize?: number;
    filter?: PostFilter;
}

function hasPostFilter(filter?: PostFilter): boolean {
    return Boolean(filter?.tag || filter?.author || filter?.createdAt || filter?.publishedAt);
}

export function buildPostWhere(filter?: PostFilter) {
    const dateWhere = buildDateWhere(filter);
    const conditions = dateWhere.sql ? [dateWhere.sql] : [];
    const params = [...dateWhere.params];

    if (filter?.tag) {
        const column = filter.tag.slug ? 'slug' : filter.tag.name ? 'name' : null;
        if (column) {
            conditions.push(
                `EXISTS (SELECT 1 FROM PostTags pt JOIN Tags t ON t.id = pt.tag_id WHERE pt.post_id = Posts.id AND t.${column} = ?)`
            );
            params.push(filter.tag[column]!);
        } else {
            conditions.push('1 = 0');
        }
    }

    if (filter?.author) {
        const column = filter.author.slug ? 'slug' : filter.author.name ? 'name' : filter.author.email ? 'email' : null;
        if (column) {
            conditions.push(
                `EXISTS (SELECT 1 FROM PostAuthors pa JOIN Authors a ON a.id = pa.author_id WHERE pa.post_id = Posts.id AND a.${column} = ?)`
            );
            params.push(filter.author[column]!);
        } else {
            conditions.push('1 = 0');
        }
    }

    return {sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params};
}

export interface DuplicateSlugEntry {
    oldSlug: string;
    newSlug: string;
    url: string;
}

export interface ContentStats {
    posts: number;
    pages: number;
    users: number;
    tags: number;
    userAssociations: number;
    tagAssociations: number;
    links: number;
}

export interface UpdatePostDataOptions {
    webscrapeData?: unknown;
}

export interface WriteGhostJsonOptions {
    batchSize?: number;
    filename?: string;
    filter?: PostFilter;
    onWrite?: (file: WrittenFile) => void;
}

export interface WriteGhostCSVOptions {
    filename?: string;
    filter?: PostFilter;
}

export interface MigrationReportEntry {
    id: number;
    type: MigrationEventType;
    postId: number | null;
    lookupKey: string | null;
    details: unknown;
    createdAt: string;
    phase: 'ingestion' | 'mapping';
    ingestionId: number | null;
    sourceRecordId: number | null;
}

export interface MigrationReport {
    summary: Record<MigrationEventType, number>;
    events: MigrationReportEntry[];
}

export interface MigrateContextOptions {
    dbPath?: string;
    storage?: 'temporary' | 'memory';
    /** Clear stored migration content during init so the caller can ingest the source again. */
    resetContent?: boolean;
    /** @deprecated Use storage: 'memory' for an explicit in-memory database. */
    ephemeral?: boolean;
    /** @deprecated Events are naturally disabled when no listeners are registered. */
    emitEvents?: boolean;
    /** @deprecated Duplicate skips are available through events and getMigrationReport(). */
    warnOnLookupKeyDuplicate?: boolean;
    onDuplicate?: DuplicatePostPolicy;
}

export default class MigrateContext extends MigrateBase {
    #dbPath: string | null;
    #storage: 'persistent' | 'temporary' | 'memory';
    #temporaryDirectory: string | null = null;
    #sources: SourceRecords | null = null;
    #resetContent: boolean;
    #emitEvents: boolean;
    #warnOnLookupKeyDuplicate: boolean;
    #onDuplicate: DuplicatePostPolicy | undefined;
    #db: DatabaseModels | null = null;
    #emitter = new EventEmitter();

    constructor({
        dbPath,
        storage,
        resetContent = false,
        ephemeral,
        emitEvents = true,
        warnOnLookupKeyDuplicate = false,
        onDuplicate,
        ...unsupportedOptions
    }: MigrateContextOptions = {}) {
        super();

        this.#emitEvents = emitEvents;
        this.#warnOnLookupKeyDuplicate = warnOnLookupKeyDuplicate;
        this.#onDuplicate = onDuplicate;
        this.#resetContent = resetContent;

        if (Object.hasOwn(unsupportedOptions, 'contentIdentity')) {
            throw new errors.BadRequestError({
                message: 'contentIdentity was removed; callers own ingestion and reuse policy.'
            });
        }
        if (Object.hasOwn(unsupportedOptions, 'mode')) {
            throw new errors.BadRequestError({message: 'Use resetContent: true instead of the removed mode option.'});
        }
        if (Object.hasOwn(unsupportedOptions, 'rereadSource')) {
            throw new errors.BadRequestError({message: 'Use resetContent instead of rereadSource.'});
        }
        if (dbPath !== undefined && (typeof dbPath !== 'string' || !dbPath.trim())) {
            throw new errors.BadRequestError({message: 'dbPath must be a non-empty path.'});
        }
        if (typeof resetContent !== 'boolean') {
            throw new errors.BadRequestError({message: 'resetContent must be a boolean.'});
        }
        if (dbPath && storage) {
            throw new errors.BadRequestError({message: 'Pass either dbPath or storage, not both.'});
        }
        if (dbPath) {
            this.#dbPath = dbPath;
            this.#storage = 'persistent';
        } else if (storage === 'memory' || ephemeral === true) {
            this.#dbPath = null;
            this.#storage = 'memory';
        } else {
            this.#dbPath = null;
            this.#storage = 'temporary';
        }
    }

    get db(): DatabaseModels {
        if (!this.#db) {
            throw new errors.InternalServerError({message: 'Database not initialized. Call init() first.'});
        }
        return this.#db;
    }

    async init() {
        if (this.#db) {
            throw new errors.InternalServerError({
                message: 'MigrateContext is already initialized. Call close() before reinitializing.'
            });
        }
        let databasePath: string;
        if (this.#storage === 'memory') {
            databasePath = ':memory:';
        } else if (this.#storage === 'persistent') {
            databasePath = this.#dbPath!;
            await mkdir(dirname(databasePath), {recursive: true});
        } else {
            this.#temporaryDirectory = await mkdtemp(join(tmpdir(), 'mg-context-'));
            databasePath = join(this.#temporaryDirectory, 'mg-context.sqlite');
            this.#dbPath = databasePath;
        }

        try {
            this.#db = createDatabase(databasePath);
        } catch (error) {
            /* c8 ignore next 4 -- defensive cleanup when SQLite initialization fails */
            if (this.#temporaryDirectory) {
                await rm(this.#temporaryDirectory, {recursive: true, force: true});
                this.#temporaryDirectory = null;
            }
            throw error;
        }
        this.#sources = new SourceRecords(
            () => this.db,
            () => this.#clearMapped()
        );
        this.#db.hasListeners = type => this.#emitEvents && this.#emitter.listenerCount(type) > 0;
        this.#db.emitEvent = (event: DatabaseEvent) => {
            if (this.#emitEvents) {
                this.#emitter.emit(event.type, event.payload);
            }
        };

        if (this.#resetContent) {
            this.reset();
        }
    }

    async close() {
        try {
            if (this.#db) {
                try {
                    this.#sources!.close();
                } finally {
                    this.#sources = null;
                    try {
                        this.#db.db.close();
                    } finally {
                        this.#db = null;
                    }
                }
            }
        } finally {
            if (this.#temporaryDirectory) {
                const directory = this.#temporaryDirectory;
                this.#temporaryDirectory = null;
                await rm(directory, {recursive: true, force: true});
            }
        }
    }

    /** The SQLite path in use, or :memory: for explicit memory storage. */
    get databasePath(): string {
        return this.#storage === 'memory' ? ':memory:' : this.#dbPath!;
    }

    /** The version of the mg-context schema stored in the open SQLite database. */
    get schemaVersion(): number {
        return this.db.schemaVersion;
    }

    /** Return content counts when populated, or false when the database is empty. */
    hasContent(): ContentStats | false {
        const row = this.db.stmts.contentStats.get() as {
            posts: number;
            pages: number;
            users: number;
            tags: number;
            post_user_associations: number;
            post_tag_associations: number;
            links: number;
        };
        const stats: ContentStats = {
            posts: row.posts,
            pages: row.pages,
            users: row.users,
            tags: row.tags,
            userAssociations: row.post_user_associations,
            tagAssociations: row.post_tag_associations,
            links: row.links
        };

        return Object.values(stats).some(count => count > 0) ? stats : false;
    }

    get sources(): SourceRecords {
        if (!this.#sources) {
            throw new errors.InternalServerError({message: 'Database not initialized. Call init() first.'});
        }
        return this.#sources;
    }

    #clearMapped(): void {
        const db = this.db;
        withTransaction(db, () => {
            db.db.exec(`DELETE FROM PostTags; DELETE FROM PostAuthors; DELETE FROM Posts;
                DELETE FROM Tags; DELETE FROM Authors; DELETE FROM Links; DELETE FROM SourceEntityLinks;
                DELETE FROM MigrationEvents WHERE phase = 'mapping';
                DELETE FROM Fingerprints; DELETE FROM PendingEvents;`);
        });
    }

    resetMappedContent(): void {
        this.sources.assertIdle();
        this.#clearMapped();
    }

    async rebuildMappedContent<T>(callback: () => T | Promise<T>): Promise<T> {
        this.sources.assertIdle();
        return this.savepoint(async () => {
            this.#clearMapped();
            return await callback();
        });
    }

    reset(): void {
        if (arguments.length > 0) {
            throw new errors.BadRequestError({message: 'reset() no longer accepts options.'});
        }
        this.sources.assertIdle();
        withTransaction(this.db, () => {
            this.#clearMapped();
            this.db.db.exec(`DELETE FROM SourceRecords; DELETE FROM SourceIngestions; DELETE FROM MigrationEvents;
                DELETE FROM sqlite_sequence WHERE name IN ('Posts', 'Tags', 'Authors', 'PostTags', 'PostAuthors', 'Links', 'MigrationEvents', 'SourceRecords', 'SourceIngestions', 'PendingEvents');`);
        });
    }

    async savepoint<T>(callback: () => T | Promise<T>): Promise<T> {
        if (!this.db.inTransaction) {
            return this.transaction(callback);
        }
        const name = `record_${randomUUID().replaceAll('-', '')}`;
        this.db.db.exec(`SAVEPOINT ${name}`);
        try {
            const result = await callback();
            this.db.db.exec(`RELEASE ${name}`);
            return result;
        } catch (error) {
            this.db.db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
            throw error;
        }
    }

    /**
     * Map records one at a time, each inside its own savepoint. A `RecordDataError` rolls back that record's
     * writes and records a `record:skipped` diagnostic; any other error fails the whole mapping. A mapper that
     * returns `false` leaves the record unselected.
     */
    async mapRecords(
        records: AsyncIterable<SourceRecord> | Iterable<SourceRecord>,
        mapper: RecordMapper
    ): Promise<MappingSummary> {
        const summary: MappingSummary = {selected: 0, imported: 0, skipped: 0};
        for await (const record of records) {
            try {
                if ((await this.savepoint(() => mapper(record))) === false) {
                    continue;
                }
                summary.imported++;
            } catch (error) {
                if (!(error instanceof RecordDataError)) {
                    throw error;
                }
                summary.skipped++;
                this.recordDiagnostic('record:skipped', {...record.metadata, reason: error.message}, record.id);
            }
            summary.selected++;
        }
        return summary;
    }

    /** Count diagnostics of the `WARNING_EVENT_TYPES` from both ingestion and mapping. */
    countWarnings(): number {
        let count = 0;
        for (const row of this.db.stmts.countMigrationEventsByType.all() as Array<{type: string; count: number}>) {
            if (WARNING_EVENT_TYPES.includes(row.type)) {
                count += row.count;
            }
        }
        return count;
    }

    recordDiagnostic(type: string, details: JsonObject = {}, sourceRecordId?: number): void {
        assertMappedWrite(this.db);
        if (!type.trim() || (sourceRecordId !== undefined && !this.sources.getById(sourceRecordId))) {
            throw new errors.BadRequestError({message: 'Diagnostic requires a type and a completed source record.'});
        }
        this.db.db
            .prepare(
                "INSERT INTO MigrationEvents(type, details, created_at, phase, source_record_id) VALUES (?, ?, ?, 'mapping', ?)"
            )
            .run(type, serializeMetadata(details), new Date().toISOString(), sourceRecordId ?? null);
    }

    async *streamDiagnostics({
        phase,
        ingestionId,
        batchSize = 25
    }: {
        phase?: 'ingestion' | 'mapping';
        ingestionId?: number;
        batchSize?: number;
    } = {}): AsyncGenerator<MigrationReportEntry> {
        if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
            throw new RangeError('batchSize must be a positive safe integer.');
        }
        const conditions = ['id > ?'];
        const params: (string | number)[] = [];
        if (phase !== undefined) {
            conditions.push('phase = ?');
            params.push(phase);
        }
        if (ingestionId !== undefined) {
            conditions.push('ingestion_id = ?');
            params.push(ingestionId);
        }
        const query = this.db.db.prepare(
            `SELECT * FROM MigrationEvents WHERE ${conditions.join(' AND ')} ORDER BY id LIMIT ?`
        );
        let after = 0;
        while (true) {
            const rows = query.all(after, ...params, batchSize) as any[];
            if (!rows.length) {
                break;
            }
            for (const row of rows) {
                after = row.id;
                yield {
                    id: row.id,
                    type: row.type,
                    postId: row.post_id,
                    lookupKey: row.lookup_key,
                    details: JSON.parse(row.details),
                    createdAt: row.created_at,
                    phase: row.phase,
                    ingestionId: row.ingestion_id,
                    sourceRecordId: row.source_record_id
                };
            }
        }
    }

    writeGhostJsonStream(outputDir: string, options: WriteGhostJsonOptions = {}): AsyncGenerator<WrittenFile> {
        return writeGhostJson(this, outputDir, {
            ...options,
            onWrite: file => {
                options.onWrite?.(file);
                if (this.#emitEvents) {
                    this.#emitter.emit('export:file-written', structuredClone(file));
                }
            }
        });
    }

    writeMigrationReport(path: string, summary: Record<string, unknown> = {}): Promise<void> {
        return writeMigrationReport(this, path, summary);
    }

    on<K extends keyof MigrateContextEventMap>(event: K, listener: (payload: MigrateContextEventMap[K]) => void) {
        this.#emitter.on(event, listener);
        return this;
    }

    off<K extends keyof MigrateContextEventMap>(event: K, listener: (payload: MigrateContextEventMap[K]) => void) {
        this.#emitter.off(event, listener);
        return this;
    }

    getMigrationReport(): MigrationReport {
        const summary: Record<MigrationEventType, number> = {
            'post:inserted': 0,
            'post:skipped': 0,
            'post:replaced': 0,
            'field:sanitized': 0,
            'slug:renamed': 0
        };
        for (const row of this.db.stmts.countMigrationEventsByType.all() as Array<{
            type: MigrationEventType;
            count: number;
        }>) {
            summary[row.type] = row.count;
        }

        const events = (this.db.stmts.findMigrationEvents.all() as any[]).map(row => ({
            id: row.id as number,
            type: row.type as MigrationEventType,
            postId: (row.post_id as number | null) ?? null,
            lookupKey: (row.lookup_key as string | null) ?? null,
            details: JSON.parse(row.details as string),
            createdAt: row.created_at as string,
            phase: row.phase,
            ingestionId: row.ingestion_id,
            sourceRecordId: row.source_record_id
        }));

        return {summary, events};
    }

    get duplicateSlugs(): DuplicateSlugEntry[] {
        return this.#collectDuplicateSlugs();
    }

    /**
     * Materialize persisted sanitization diagnostics for the current mapped result.
     * Use streamDiagnostics() when the full array would be too large.
     */
    get sanitizedFields(): SanitizedField[] {
        return this.db.sanitizedFields;
    }

    #postUrl(row: any): string {
        const data = JSON.parse(row.data as string);
        return data.canonical_url || '';
    }

    async deduplicateSlugs(): Promise<DuplicateSlugEntry[]> {
        return this.#collectDuplicateSlugs();
    }

    #collectDuplicateSlugs(): DuplicateSlugEntry[] {
        // Slug deduplication happens at insert time in PostContext.save(), which records the
        // pre-deduplication slug in original_slug. The groups are rebuilt from the database
        // rather than from the in-memory renames, so the result is still complete when
        // resuming against an existing dbPath, where the renames happened on an earlier run.
        const renamedRows = this.db.stmts.findRenamedPosts.all() as any[];

        if (renamedRows.length === 0) {
            return [];
        }

        // Group the renamed posts by the slug they originally wanted. Map preserves
        // insertion order, so groups come out ordered by their first renamed post.
        const groups = new Map<string, any[]>();
        for (const row of renamedRows) {
            const originalSlug = row.original_slug as string;
            const group = groups.get(originalSlug);
            if (group) {
                group.push(row);
            } else {
                groups.set(originalSlug, [row]);
            }
        }

        const result: DuplicateSlugEntry[] = [];

        for (const [originalSlug, rows] of groups) {
            // The retained post is the one still holding the original slug. If no post
            // holds it, these rows were not renamed by a collision — a slug changed after
            // insert also leaves original_slug behind — so there is no group to report.
            const retainedRows = this.db.stmts.findPostsBySlug.all(originalSlug) as any[];
            if (retainedRows.length === 0) {
                continue;
            }

            result.push({
                oldSlug: originalSlug,
                newSlug: originalSlug,
                url: this.#postUrl(retainedRows[0])
            });

            for (const row of rows) {
                result.push({
                    oldSlug: originalSlug,
                    newSlug: row.slug as string,
                    url: this.#postUrl(row)
                });
            }
        }

        return result;
    }

    async prepareForExport({batchSize = 200}: {batchSize?: number} = {}): Promise<void> {
        assertMappedWrite(this.db);
        if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
            throw new RangeError('batchSize must be a positive safe integer.');
        }
        const total = (this.db.stmts.countPosts.get() as {count: number}).count;
        let processed = 0;
        let after = 0;
        const query = this.db.db.prepare('SELECT id, data FROM Posts WHERE id > ? ORDER BY id LIMIT ?');
        while (true) {
            const rows = query.all(after, batchSize) as any[];
            if (!rows.length) {
                break;
            }
            withTransaction(this.db, () => {
                for (const row of rows) {
                    const data = JSON.parse(row.data);
                    const title = normalizeTitle(data.title);
                    if (data.title !== title) {
                        recordSanitizedFields(this.db, [
                            {
                                context: 'PostContext',
                                slug: data.slug ?? '',
                                field: 'title',
                                reason: 'replaced',
                                oldValue: data.title,
                                newValue: title
                            }
                        ]);
                        data.title = title;
                        this.db.stmts.updatePostData.run(JSON.stringify(data), row.id);
                    }
                    after = row.id;
                }
            });
            processed += rows.length;
            if (this.#emitEvents) {
                this.#emitter.emit('progress', {operation: 'prepareForExport', processed, total});
            }
        }
    }

    async transaction<T>(callback: () => T | Promise<T>): Promise<T> {
        this.sources.assertIdle();
        if (this.db.inTransaction) {
            return await callback();
        }

        this.db.db.exec('BEGIN');
        this.db.inTransaction = true;
        try {
            const result = await callback();
            this.db.db.exec('COMMIT');
            this.db.inTransaction = false;
            flushDatabaseEvents(this.db);
            return result;
        } catch (err) {
            if (this.db.inTransaction) {
                this.db.db.exec('ROLLBACK');
            }
            throw err;
            /* c8 ignore next */
        } finally {
            this.db.inTransaction = false;
        }
    }

    #buildFilterWhere(filter?: PostFilter) {
        return buildPostWhere(filter);
    }

    async *#filteredRows(filter: PostFilter, batchSize: number, operation: string): AsyncGenerator<any> {
        if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
            throw new RangeError('batchSize must be a positive safe integer.');
        }
        const where = this.#buildFilterWhere(filter);
        const iteration = randomUUID();
        this.db.db
            .prepare(`INSERT INTO IterationPosts SELECT ?, id FROM Posts ${where.sql}`)
            .run(iteration, ...where.params);
        try {
            const total = (
                this.db.db
                    .prepare('SELECT COUNT(*) AS count FROM IterationPosts WHERE iteration_id = ?')
                    .get(iteration) as {count: number}
            ).count;
            const query = this.db.db.prepare(
                'SELECT p.* FROM IterationPosts i JOIN Posts p ON p.id = i.post_id WHERE i.iteration_id = ? AND i.post_id > ? ORDER BY i.post_id LIMIT ?'
            );
            let after = 0;
            let processed = 0;
            while (true) {
                const rows = query.all(iteration, after, batchSize) as any[];
                if (!rows.length) {
                    break;
                }
                for (const row of rows) {
                    after = row.id;
                    yield row;
                    processed += 1;
                }
                if (this.#emitEvents) {
                    this.#emitter.emit('progress', {operation, processed, total});
                }
            }
        } finally {
            this.db.db.prepare('DELETE FROM IterationPosts WHERE iteration_id = ?').run(iteration);
        }
    }

    // eslint-disable-next-line no-unused-vars
    async forEachPost(
        callback: (post: PostContext) => Promise<void>,
        {batchSize = 100, filter}: ForEachPostOptions = {}
    ) {
        if (!hasPostFilter(filter)) {
            const total = (this.db.stmts.countPosts.get() as {count: number}).count;
            const maxId = (this.db.stmts.findMaxPostId.get() as {max_id: number | null}).max_id;

            await this.#forEachByKeyset(
                total,
                maxId,
                batchSize,
                'forEachPost',
                (afterId, upperId, limit) => this.db.stmts.findPostsAfterId.all(afterId, upperId, limit) as any[],
                row => PostContext.fromRow(row, this.db),
                callback,
                post => {
                    withTransaction(this.db, () => {
                        post.save(this.db);
                    });
                }
            );
            return;
        }

        for await (const row of this.#filteredRows(filter!, batchSize, 'forEachPost')) {
            const post = PostContext.fromRow(row, this.db);
            await callback(post);
            post.save(this.db);
        }
    }

    async *streamPosts({batchSize = 100, filter}: ForEachPostOptions = {}): AsyncGenerator<PostContext> {
        if (!hasPostFilter(filter)) {
            const total = (this.db.stmts.countPosts.get() as {count: number}).count;
            const maxId = (this.db.stmts.findMaxPostId.get() as {max_id: number | null}).max_id;

            yield* this.#streamByKeyset(
                total,
                maxId,
                batchSize,
                'streamPosts',
                (afterId, upperId, limit) => this.db.stmts.findPostsAfterId.all(afterId, upperId, limit) as any[],
                row => PostContext.fromRow(row, this.db)
            );
            return;
        }

        for await (const row of this.#filteredRows(filter!, batchSize, 'streamPosts')) {
            yield PostContext.fromRow(row, this.db);
        }
    }

    async *streamTags({
        batchSize = 100,
        scope = 'referenced'
    }: EntityIterationOptions = {}): AsyncGenerator<TagContext> {
        const total = (
            (scope === 'all' ? this.db.stmts.countAllTags : this.db.stmts.countUsedTags).get() as {count: number}
        ).count;
        const maxId = (
            (scope === 'all' ? this.db.stmts.findMaxTagId : this.db.stmts.findMaxUsedTagId).get() as {
                max_id: number | null;
            }
        ).max_id;

        yield* this.#streamByKeyset(
            total,
            maxId,
            batchSize,
            'streamTags',
            (afterId, upperId, limit) =>
                (scope === 'all' ? this.db.stmts.findTagsAfterId : this.db.stmts.findUsedTagsAfterId).all(
                    afterId,
                    upperId,
                    limit
                ) as any[],
            row => TagContext.fromRow(row)
        );
    }

    async *streamAuthors({
        batchSize = 100,
        scope = 'referenced'
    }: EntityIterationOptions = {}): AsyncGenerator<AuthorContext> {
        const total = (
            (scope === 'all' ? this.db.stmts.countAllAuthors : this.db.stmts.countUsedAuthors).get() as {count: number}
        ).count;
        const maxId = (
            (scope === 'all' ? this.db.stmts.findMaxAuthorId : this.db.stmts.findMaxUsedAuthorId).get() as {
                max_id: number | null;
            }
        ).max_id;

        yield* this.#streamByKeyset(
            total,
            maxId,
            batchSize,
            'streamAuthors',
            (afterId, upperId, limit) =>
                (scope === 'all' ? this.db.stmts.findAuthorsAfterId : this.db.stmts.findUsedAuthorsAfterId).all(
                    afterId,
                    upperId,
                    limit
                ) as any[],
            row => AuthorContext.fromRow(row)
        );
    }

    async #forEachByKeyset<T>(
        total: number,
        maxId: number | null,
        batchSize: number,
        eventName: string,
        fetchBatch: (afterId: number, upperId: number, limit: number) => any[],
        toEntity: (row: any) => T,
        callback: (entity: T) => Promise<void>,
        save: (entity: T) => void
    ): Promise<void> {
        if (maxId === null) {
            return;
        }

        let processed = 0;
        let lastId = 0;
        let rows: any[];

        do {
            rows = fetchBatch(lastId, maxId, batchSize);

            for (const row of rows) {
                lastId = row.id as number;
                const entity = toEntity(row);
                await callback(entity);
                save(entity);
                processed += 1;
            }

            if (this.#emitEvents) {
                this.#emitter.emit('progress', {operation: eventName, processed, total});
            }
        } while (rows.length === batchSize && lastId < maxId);
    }

    async *#streamByKeyset<T>(
        total: number,
        maxId: number | null,
        batchSize: number,
        eventName: string,
        fetchBatch: (afterId: number, upperId: number, limit: number) => any[],
        toEntity: (row: any) => T
    ): AsyncGenerator<T> {
        if (maxId === null) {
            return;
        }

        let processed = 0;
        let lastId = 0;
        let rows: any[];

        do {
            rows = fetchBatch(lastId, maxId, batchSize);

            for (const row of rows) {
                lastId = row.id as number;
                yield toEntity(row);
                processed += 1;
            }

            if (this.#emitEvents) {
                this.#emitter.emit('progress', {operation: eventName, processed, total});
            }
        } while (rows.length === batchSize && lastId < maxId);
    }

    async addPost(post?: PostContext | PostConstructorOptions): Promise<PostContext> {
        let newPost: PostContext;

        if (post && post instanceof PostContext) {
            newPost = post;
            newPost.onDuplicate = this.#onDuplicate ?? newPost.onDuplicate;
            newPost.warnOnLookupKeyDuplicate = this.#warnOnLookupKeyDuplicate;
            newPost.save(this.db);
        } else if (post && typeof post === 'object') {
            newPost = new PostContext({
                ...post,
                onDuplicate: post.onDuplicate ?? this.#onDuplicate
            });
            newPost.warnOnLookupKeyDuplicate = this.#warnOnLookupKeyDuplicate;
        } else {
            newPost = new PostContext({onDuplicate: this.#onDuplicate});
            newPost.warnOnLookupKeyDuplicate = this.#warnOnLookupKeyDuplicate;
        }

        return newPost;
    }

    async getAllPosts(): Promise<PostContext[]> {
        const rows = this.db.stmts.findAllPostsOrdered.all() as any[];
        return rows.map((row: any) => PostContext.fromRow(row, this.db));
    }

    /**
     * Patch scalar post data without hydrating or replacing tag/author relationships.
     * Slugs stay on the full PostContext save path because they require deduplication
     * and redirect tracking.
     */
    updatePostData(dbId: number, patch: PostDataPatch, options: UpdatePostDataOptions = {}): void {
        assertMappedWrite(this.db);
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
            throw new errors.BadRequestError({message: 'Post data patch must be an object.'});
        }

        const forbiddenField = ['slug', 'tags', 'authors'].find(field => Object.hasOwn(patch, field));
        if (forbiddenField) {
            throw new errors.BadRequestError({
                message: `Post data patch cannot update "${forbiddenField}". Use PostContext.save() instead.`
            });
        }

        const row = this.db.stmts.findPostById.get(dbId) as any;
        if (!row) {
            throw new errors.NotFoundError({message: `Post with database ID ${dbId} was not found.`});
        }

        const post = PostContext.fromRow(row, this.db, {hydrateRelationships: false});
        for (const [key, value] of Object.entries(patch)) {
            post.set(key, value);
        }
        const sanitized: SanitizedField[] = [];
        post.sanitize(sanitized);
        post.checkRequired(post.data);

        const postData = {...post.data};
        delete postData.tags;
        delete postData.authors;

        const toISOString = (value: Date | null): string | null => value?.toISOString() ?? null;

        withTransaction(this.db, () => {
            this.db.stmts.patchPostData.run(
                JSON.stringify(postData),
                toISOString(post.data.created_at),
                toISOString(post.data.updated_at),
                toISOString(post.data.published_at),
                dbId
            );

            if (Object.hasOwn(options, 'webscrapeData')) {
                this.db.stmts.updatePostWebscrapeData.run(JSON.stringify(options.webscrapeData) ?? null, dbId);
            }
            recordSanitizedFields(this.db, sanitized);
        });
    }

    async findPosts({
        slug,
        title,
        tagSlug,
        tagName,
        authorSlug,
        authorName,
        authorEmail
    }: FindPostsOptions = {}): Promise<PostContext[] | null> {
        if (slug) {
            const rows = this.db.stmts.findPostsBySlug.all(slug) as any[];
            return rows.map((row: any) => PostContext.fromRow(row, this.db));
        } else if (title) {
            const rows = this.db.stmts.findAllPostsOrdered.all() as any[];
            const results: PostContext[] = [];
            for (const row of rows) {
                const data = JSON.parse(row.data as string);
                if (data.title === title) {
                    results.push(PostContext.fromRow(row, this.db));
                }
            }
            return results;
        } else if (tagSlug) {
            const tag = this.db.stmts.findTagBySlug.get(tagSlug) as any;
            if (!tag) {
                return [];
            }
            const postTags = this.db.stmts.findPostTagsByTagId.all(tag.id) as any[];
            const results: PostContext[] = [];
            for (const pt of postTags) {
                const postRow = this.db.stmts.findPostById.get(pt.post_id) as any;
                if (postRow) {
                    results.push(PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (tagName) {
            const tags = this.db.stmts.findTagsByName.all(tagName) as any[];
            const postIds = new Set<number>();
            for (const t of tags) {
                const postTags = this.db.stmts.findPostTagsByTagId.all(t.id) as any[];
                for (const pt of postTags) {
                    postIds.add(pt.post_id as number);
                }
            }
            const results: PostContext[] = [];
            for (const postId of postIds) {
                const postRow = this.db.stmts.findPostById.get(postId) as any;
                if (postRow) {
                    results.push(PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (authorSlug) {
            const author = this.db.stmts.findAuthorBySlug.get(authorSlug) as any;
            if (!author) {
                return [];
            }
            const postAuthors = this.db.stmts.findPostAuthorsByAuthorId.all(author.id) as any[];
            const results: PostContext[] = [];
            for (const pa of postAuthors) {
                const postRow = this.db.stmts.findPostById.get(pa.post_id) as any;
                if (postRow) {
                    results.push(PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (authorName) {
            const authors = this.db.stmts.findAuthorsByName.all(authorName) as any[];
            const postIds = new Set<number>();
            for (const a of authors) {
                const postAuthors = this.db.stmts.findPostAuthorsByAuthorId.all(a.id) as any[];
                for (const pa of postAuthors) {
                    postIds.add(pa.post_id as number);
                }
            }
            const results: PostContext[] = [];
            for (const postId of postIds) {
                const postRow = this.db.stmts.findPostById.get(postId) as any;
                if (postRow) {
                    results.push(PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (authorEmail) {
            const author = this.db.stmts.findAuthorByEmail.get(authorEmail) as any;
            if (!author) {
                return [];
            }
            const postAuthors = this.db.stmts.findPostAuthorsByAuthorId.all(author.id) as any[];
            const results: PostContext[] = [];
            for (const pa of postAuthors) {
                const postRow = this.db.stmts.findPostById.get(pa.post_id) as any;
                if (postRow) {
                    results.push(PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else {
            return null;
        }
    }

    addLink(oldUrl: string, newUrl: string): void {
        assertMappedWrite(this.db);
        this.db.stmts.insertLink.run(oldUrl, newUrl);
    }

    findLink(oldUrl: string): string | null {
        const row = this.db.stmts.findLink.get(oldUrl) as any;
        return row ? (row.new_url as string) : null;
    }

    async findTags({slug, name, scope = 'referenced'}: FindTagsOptions = {}): Promise<TagContext[] | null> {
        let rows: any[];
        if (slug) {
            rows = this.db.stmts.findTagsBySlug.all(slug) as any[];
        } else if (name) {
            rows = this.db.stmts.findTagsByName.all(name) as any[];
        } else {
            return null;
        }

        if (scope === 'referenced') {
            rows = rows.filter(row => this.db.stmts.tagIsUsed.get(row.id));
        }
        return rows.map((row: any) => TagContext.fromRow(row));
    }

    // eslint-disable-next-line no-unused-vars
    async forEachTag(
        callback: (tag: TagContext) => Promise<void>,
        {batchSize = 100, scope = 'referenced'}: EntityIterationOptions = {}
    ) {
        const total = (
            (scope === 'all' ? this.db.stmts.countAllTags : this.db.stmts.countUsedTags).get() as {count: number}
        ).count;
        const maxId = (
            (scope === 'all' ? this.db.stmts.findMaxTagId : this.db.stmts.findMaxUsedTagId).get() as {
                max_id: number | null;
            }
        ).max_id;

        await this.#forEachByKeyset(
            total,
            maxId,
            batchSize,
            'forEachTag',
            (afterId, upperId, limit) =>
                (scope === 'all' ? this.db.stmts.findTagsAfterId : this.db.stmts.findUsedTagsAfterId).all(
                    afterId,
                    upperId,
                    limit
                ) as any[],
            row => TagContext.fromRow(row),
            callback,
            tag => tag.save(this.db)
        );
    }

    // eslint-disable-next-line no-unused-vars
    async forEachAuthor(
        callback: (author: AuthorContext) => Promise<void>,
        {batchSize = 100, scope = 'referenced'}: EntityIterationOptions = {}
    ) {
        const total = (
            (scope === 'all' ? this.db.stmts.countAllAuthors : this.db.stmts.countUsedAuthors).get() as {count: number}
        ).count;
        const maxId = (
            (scope === 'all' ? this.db.stmts.findMaxAuthorId : this.db.stmts.findMaxUsedAuthorId).get() as {
                max_id: number | null;
            }
        ).max_id;

        await this.#forEachByKeyset(
            total,
            maxId,
            batchSize,
            'forEachAuthor',
            (afterId, upperId, limit) =>
                (scope === 'all' ? this.db.stmts.findAuthorsAfterId : this.db.stmts.findUsedAuthorsAfterId).all(
                    afterId,
                    upperId,
                    limit
                ) as any[],
            row => AuthorContext.fromRow(row),
            callback,
            author => author.save(this.db)
        );
    }

    async findAuthors({slug, name, email, scope = 'referenced'}: FindAuthorsOptions = {}): Promise<
        AuthorContext[] | null
    > {
        let rows: any[];
        if (slug) {
            rows = this.db.stmts.findAuthorsBySlug.all(slug) as any[];
        } else if (name) {
            rows = this.db.stmts.findAuthorsByName.all(name) as any[];
        } else if (email) {
            rows = this.db.stmts.findAuthorsByEmail.all(email) as any[];
        } else {
            return null;
        }

        if (scope === 'referenced') {
            rows = rows.filter(row => this.db.stmts.authorIsUsed.get(row.id));
        }
        return rows.map((row: any) => AuthorContext.fromRow(row));
    }

    // eslint-disable-next-line no-unused-vars
    async forEachGhostPost(
        callback: (json: any, post: PostContext) => Promise<void>,
        {batchSize = 100, filter}: ForEachPostOptions = {}
    ) {
        const where = this.#buildFilterWhere(filter);
        const total = countWhere(this.db, where);
        let processed = 0;

        for (let offset = 0; offset < total; offset += batchSize) {
            const rows = findPostsWhere(this.db, where, batchSize, offset);

            for (const row of rows) {
                const post = PostContext.fromRow(row, this.db);
                const postFinal = post.getFinal;
                const postData = {...postFinal.data};
                postData.tags = postData.tags.map((t: any) => t.data);
                postData.authors = postData.authors.map((a: any) => a.data);
                await callback(postData, post);
                processed += 1;
            }

            if (this.#emitEvents) {
                this.#emitter.emit('progress', {operation: 'forEachGhostPost', processed, total});
            }
        }
    }

    async writeGhostJson(outputDir: string, options: WriteGhostJsonOptions = {}): Promise<WrittenFile[]> {
        const files: WrittenFile[] = [];
        for await (const file of this.writeGhostJsonStream(outputDir, options)) {
            files.push(file);
        }
        return files;
    }

    async writeGhostCSV(
        outputDir: string,
        {filename: rawFilename = 'posts', filter}: WriteGhostCSVOptions = {}
    ): Promise<WrittenFile> {
        const name = `${exportBaseFilename(rawFilename, 'csv')}.csv`;
        await this.prepareForExport();
        await mkdir(outputDir, {recursive: true});

        const where = buildPostWhere(filter);
        const total = countWhere(this.db, where);
        const {max_id: maxId} = this.db.db
            .prepare(`SELECT MAX(id) AS max_id FROM Posts ${where.sql}`)
            .get(...where.params) as {
            max_id: number | null;
        };
        const keysetWhere = where.sql
            ? `${where.sql} AND Posts.id > ? AND Posts.id <= ?`
            : 'WHERE Posts.id > ? AND Posts.id <= ?';
        const findBatch = this.db.db.prepare(`SELECT * FROM Posts ${keysetWhere} ORDER BY Posts.id ASC LIMIT ?`);
        const outputPath = join(outputDir, name);
        const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
        let postCount = 0;
        async function* lines(context: MigrateContext) {
            yield csvLine(GHOST_CSV_COLUMNS);
            let afterId = 0;

            while (maxId !== null) {
                const rows = findBatch.all(...where.params, afterId, maxId, 200) as Array<{id: number; data: string}>;
                if (rows.length === 0) {
                    break;
                }

                const postIds = rows.map(row => row.id);
                const placeholders = postIds.map(() => '?').join(',');
                const tagRows = context.db.db
                    .prepare(
                        `SELECT pt.post_id, t.data FROM PostTags pt JOIN Tags t ON t.id = pt.tag_id WHERE pt.post_id IN (${placeholders}) ORDER BY pt.post_id ASC, pt.sort_order ASC`
                    )
                    .all(...postIds) as Array<{post_id: number; data: string}>;
                const authorRows = context.db.db
                    .prepare(
                        `SELECT pa.post_id, a.data FROM PostAuthors pa JOIN Authors a ON a.id = pa.author_id WHERE pa.post_id IN (${placeholders}) ORDER BY pa.post_id ASC, pa.sort_order ASC`
                    )
                    .all(...postIds) as Array<{post_id: number; data: string}>;
                const relations = new Map<number, CsvPostRelations>(postIds.map(id => [id, {authors: [], tags: []}]));

                for (const row of tagRows) {
                    const tag = JSON.parse(row.data) as {name: string};
                    relations.get(row.post_id)!.tags.push(tag.name);
                }
                for (const row of authorRows) {
                    const author = JSON.parse(row.data) as {name: string; email: string};
                    relations.get(row.post_id)!.authors.push({name: author.name, email: author.email});
                }

                for (const row of rows) {
                    yield csvPostLine(JSON.parse(row.data) as Record<string, unknown>, relations.get(row.id)!);
                    postCount += 1;
                }
                afterId = rows[rows.length - 1].id;
                if (context.#emitEvents) {
                    context.#emitter.emit('progress', {operation: 'writeGhostCSV', processed: postCount, total});
                }
            }
        }

        try {
            await pipeline(Readable.from(lines(this)), createWriteStream(temporaryPath, {encoding: 'utf8'}));
            const fileStats = await stat(temporaryPath);
            const written: WrittenFile = {path: resolve(outputPath), name, size: fileStats.size, posts: postCount};
            await rename(temporaryPath, outputPath);
            if (this.#emitEvents) {
                this.#emitter.emit('export:file-written', structuredClone(written));
            }
            return written;
        } finally {
            await rm(temporaryPath, {force: true});
        }
    }

    async writeGhostTagsJson(
        outputDir: string,
        {filename = 'tags', scope = 'referenced'}: {filename?: string; scope?: EntityScope} = {}
    ): Promise<WrittenFile> {
        const name = exportBaseFilename(filename) + '.json';
        await this.prepareForExport();
        await mkdir(outputDir, {recursive: true});

        const rows = (scope === 'all' ? this.db.stmts.findAllTags : this.db.stmts.findUsedTags).all() as any[];
        const tags = rows.map((r: any) => ({id: r.ghost_id, ...JSON.parse(r.data)}));

        const outputPath = join(outputDir, name);
        const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
        const content = JSON.stringify(
            {
                meta: {exported_on: Date.now(), version: '2.0.0'},
                data: {tags}
            },
            null,
            2
        );

        try {
            await writeFile(temporaryPath, content);
            const fileStats = await stat(temporaryPath);
            const written = {path: resolve(outputPath), name, size: fileStats.size, posts: 0};
            await rename(temporaryPath, outputPath);
            if (this.#emitEvents) {
                this.#emitter.emit('export:file-written', structuredClone(written));
            }
            return written;
        } finally {
            await rm(temporaryPath, {force: true});
        }
    }

    async writeGhostUsersJson(
        outputDir: string,
        {filename = 'users', scope = 'referenced'}: {filename?: string; scope?: EntityScope} = {}
    ): Promise<WrittenFile> {
        const name = exportBaseFilename(filename) + '.json';
        await this.prepareForExport();
        await mkdir(outputDir, {recursive: true});

        const rows = (scope === 'all' ? this.db.stmts.findAllAuthors : this.db.stmts.findUsedAuthors).all() as any[];
        const users = rows.map((r: any) => ({id: r.ghost_id, ...JSON.parse(r.data)}));

        const outputPath = join(outputDir, name);
        const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
        const content = JSON.stringify(
            {
                meta: {exported_on: Date.now(), version: '2.0.0'},
                data: {users}
            },
            null,
            2
        );

        try {
            await writeFile(temporaryPath, content);
            const fileStats = await stat(temporaryPath);
            const written = {path: resolve(outputPath), name, size: fileStats.size, posts: 0};
            await rename(temporaryPath, outputPath);
            if (this.#emitEvents) {
                this.#emitter.emit('export:file-written', structuredClone(written));
            }
            return written;
        } finally {
            await rm(temporaryPath, {force: true});
        }
    }
}
