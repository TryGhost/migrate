import {stat, mkdir, mkdtemp, open, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import errors from '@tryghost/errors';

import MigrateBase from './MigrateBase.js';
import {fingerprintContentIdentity, type ContentIdentity} from './content-identity.js';
import PostContext, {
    PostConstructorOptions,
    normalizeTitle,
    type DuplicatePostPolicy,
    type PostDataPatch,
    type PostSnapshot
} from './PostContext.js';
import TagContext from './TagContext.js';
import AuthorContext from './AuthorContext.js';
import {
    createDatabase,
    flushDatabaseEvents,
    recordSanitizedFields,
    type DatabaseEvent,
    type DatabaseModels,
    type MigrationEventType,
    type SanitizedField
} from './database.js';
import {
    withTransaction,
    findByIds,
    findByColumn,
    buildDateWhere,
    buildFullWhere,
    countWhere,
    findPostsWhere,
    findPostIdColumnsWhere,
    findAllPostIdsWhere,
    findPostsByIds
} from './db-helpers.js';

type FindPostsOptions = {
    slug?: string;
    title?: string;
    sourceAttr?: any;
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
    /** @deprecated Export-manifest cleanup is always enabled. */
    replaceExisting?: boolean;
}

export interface MigrationReportEntry {
    id: number;
    type: MigrationEventType;
    postId: number | null;
    lookupKey: string | null;
    details: unknown;
    createdAt: string;
}

export interface MigrationReport {
    summary: Record<MigrationEventType, number>;
    events: MigrationReportEntry[];
}

export interface MigrateContextOptions {
    dbPath?: string;
    storage?: 'temporary' | 'memory';
    contentIdentity?: ContentIdentity;
    /** Discard staged source records so the caller can read the export again. */
    rereadSource?: boolean;
    /** @deprecated Use storage: 'memory' for an explicit in-memory database. */
    ephemeral?: boolean;
    /** @deprecated Events are naturally disabled when no listeners are registered. */
    emitEvents?: boolean;
    /** @deprecated Duplicate skips are available through events and getMigrationReport(). */
    warnOnLookupKeyDuplicate?: boolean;
    onDuplicate?: DuplicatePostPolicy;
}

const CONTENT_IDENTITY_KEY = 'content';
const EXPORT_MANIFEST = '.mg-context-export-manifest.json';

interface ExportManifest {
    version: 1;
    exports: Record<string, string[]>;
}

function exportBaseFilename(rawFilename: string): string {
    const filename = rawFilename.replace(/\.json$/i, '');
    if (!filename || filename.includes('/') || filename.includes('\\')) {
        throw new errors.BadRequestError({
            message: 'Ghost JSON filename must be a non-empty base filename without path separators.'
        });
    }
    return filename;
}

async function readExportManifest(outputDir: string): Promise<ExportManifest> {
    try {
        const parsed = JSON.parse(await readFile(join(outputDir, EXPORT_MANIFEST), 'utf8')) as ExportManifest;
        const exportsAreValid =
            parsed.exports &&
            typeof parsed.exports === 'object' &&
            !Array.isArray(parsed.exports) &&
            Object.values(parsed.exports).every(
                fileNames =>
                    Array.isArray(fileNames) &&
                    fileNames.every(
                        fileName =>
                            typeof fileName === 'string' &&
                            fileName.length > '.json'.length &&
                            fileName.endsWith('.json') &&
                            !fileName.includes('/') &&
                            !fileName.includes('\\')
                    )
            );
        if (parsed.version !== 1 || !exportsAreValid) {
            throw new Error('Unsupported manifest shape');
        }
        return parsed;
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            return {version: 1, exports: {}};
        }
        throw new errors.InternalServerError({
            message: `Could not read ${EXPORT_MANIFEST}. Remove or repair it before exporting again.`,
            context: error
        });
    }
}

async function writeExportManifest(outputDir: string, manifest: ExportManifest): Promise<void> {
    const manifestPath = join(outputDir, EXPORT_MANIFEST);
    const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporaryPath, JSON.stringify(manifest, null, 2));
        await rename(temporaryPath, manifestPath);
    } finally {
        await rm(temporaryPath, {force: true});
    }
}

export default class MigrateContext extends MigrateBase {
    #dbPath: string | null;
    #storage: 'persistent' | 'temporary' | 'memory';
    #temporaryDirectory: string | null = null;
    #contentIdentityHash: string | undefined;
    #rereadSource: boolean;
    #emitEvents: boolean;
    #warnOnLookupKeyDuplicate: boolean;
    #onDuplicate: DuplicatePostPolicy | undefined;
    #db: DatabaseModels | null = null;
    #slugsDeduped = false;
    #duplicateSlugs: DuplicateSlugEntry[] = [];
    #emitter = new EventEmitter();

    constructor({
        dbPath,
        storage,
        contentIdentity,
        rereadSource = false,
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
        this.#rereadSource = rereadSource;

        if (Object.hasOwn(unsupportedOptions, 'mode')) {
            throw new errors.BadRequestError({message: 'Use rereadSource: true instead of the removed mode option.'});
        }
        if (dbPath !== undefined && (typeof dbPath !== 'string' || !dbPath.trim())) {
            throw new errors.BadRequestError({message: 'dbPath must be a non-empty path.'});
        }
        if (typeof rereadSource !== 'boolean') {
            throw new errors.BadRequestError({message: 'rereadSource must be a boolean.'});
        }
        if (dbPath && storage) {
            throw new errors.BadRequestError({message: 'Pass either dbPath or storage, not both.'});
        }
        if (dbPath && !rereadSource && contentIdentity === undefined) {
            throw new errors.BadRequestError({
                message:
                    'Persistent resume requires contentIdentity. Pass a source revision, or use rereadSource: true to read the export again.'
            });
        }
        this.#contentIdentityHash =
            contentIdentity === undefined ? undefined : fingerprintContentIdentity(contentIdentity);

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
        this.#db.requireSourceContent = this.#storage === 'persistent';
        this.#db.emitEvent = (event: DatabaseEvent) => {
            if (this.#emitEvents) {
                this.#emitter.emit(event.type, event.payload);
            }
        };
        this.#slugsDeduped = false;
        this.#duplicateSlugs = [];

        if (this.#rereadSource) {
            this.reset();
        }

        if (this.#contentIdentityHash !== undefined) {
            const stored = this.#getContentIdentityHash();
            if (!this.#rereadSource && this.hasContent() && stored !== this.#contentIdentityHash) {
                await this.close();
                throw new errors.InternalServerError({
                    message:
                        'The stored migration content has a different or missing source identity. Re-run with rereadSource: true to read the export again.'
                });
            }
            this.#setContentIdentityHash(this.#contentIdentityHash);
        }
    }

    async close() {
        if (this.#db) {
            this.#db.db.close();
            this.#db = null;
        }
        if (this.#temporaryDirectory) {
            await rm(this.#temporaryDirectory, {recursive: true, force: true});
            this.#temporaryDirectory = null;
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

    /**
     * Remove migration content without deleting the SQLite file or any external
     * caches. The source identity is cleared with the content it describes.
     */
    reset(): void {
        if (arguments.length > 0) {
            throw new errors.BadRequestError({
                message: 'reset() no longer accepts options; source identity is always cleared.'
            });
        }
        const db = this.db;

        withTransaction(db, () => {
            db.db.exec(`
                DELETE FROM PostTags;
                DELETE FROM PostAuthors;
                DELETE FROM Posts;
                DELETE FROM Tags;
                DELETE FROM Authors;
                DELETE FROM Links;
                DELETE FROM MigrationEvents;
            `);

            db.db.exec('DELETE FROM Fingerprints;');

            db.db.exec(
                "DELETE FROM sqlite_sequence WHERE name IN ('Posts', 'Tags', 'Authors', 'PostTags', 'PostAuthors', 'Links', 'MigrationEvents');"
            );
        });

        db.tagCache.clear();
        db.authorCache.clear();
        db.slugRenames.length = 0;
        db.sanitizedFields.length = 0;
        db.pendingEvents.length = 0;
        this.#slugsDeduped = false;
        this.#duplicateSlugs = [];
    }

    #getContentIdentityHash(): string | null {
        const row = this.db.stmts.getFingerprint.get(CONTENT_IDENTITY_KEY) as {value: string} | undefined;
        return row?.value ?? null;
    }

    #setContentIdentityHash(value: string): void {
        this.db.stmts.setFingerprint.run(CONTENT_IDENTITY_KEY, value);
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
            createdAt: row.created_at as string
        }));

        return {summary, events};
    }

    get duplicateSlugs(): DuplicateSlugEntry[] {
        return this.#duplicateSlugs;
    }

    /**
     * Every value changed to satisfy Ghost's schema during this run — see
     * MigrateBase.sanitize(). Collected as posts, tags and authors are saved.
     */
    get sanitizedFields(): SanitizedField[] {
        return this.db.sanitizedFields;
    }

    #postUrl(row: any): string {
        const source = JSON.parse(row.source_meta as string);
        const data = JSON.parse(row.data as string);
        return source.url || data.canonical_url || '';
    }

    async deduplicateSlugs(): Promise<DuplicateSlugEntry[]> {
        if (this.#slugsDeduped) {
            return this.#duplicateSlugs;
        }
        this.#slugsDeduped = true;

        // Slug deduplication happens at insert time in PostContext.save(), which records the
        // pre-deduplication slug in original_slug. The groups are rebuilt from the database
        // rather than from the in-memory renames, so the result is still complete when
        // resuming against an existing dbPath, where the renames happened on an earlier run.
        const renamedRows = this.db.stmts.findRenamedPosts.all() as any[];

        if (renamedRows.length === 0) {
            this.#duplicateSlugs = [];
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

        this.#duplicateSlugs = result;
        return result;
    }

    async prepareForExport({batchSize = 200}: {batchSize?: number} = {}): Promise<void> {
        await this.deduplicateSlugs();

        const total = (this.db.stmts.countPosts.get() as any).count;
        let processed = 0;

        for (let offset = 0; offset < total; offset += batchSize) {
            const rows = this.db.stmts.findPostsForPreparation.all(batchSize, offset) as any[];

            this.db.db.exec('BEGIN');
            this.db.inTransaction = true;
            const pendingEventCount = this.db.pendingEvents.length;
            try {
                for (const row of rows) {
                    const data = JSON.parse(row.data as string);
                    let changed = false;
                    const title = normalizeTitle(data.title);

                    if (data.title !== title) {
                        const field: SanitizedField = {
                            context: 'PostContext',
                            slug: data.slug ?? '',
                            field: 'title',
                            reason: 'replaced',
                            oldValue: data.title,
                            newValue: title
                        };
                        data.title = title;
                        changed = true;
                        this.db.sanitizedFields.push(field);
                        recordSanitizedFields(this.db, [field]);
                    }

                    if (changed) {
                        this.db.stmts.updatePostData.run(JSON.stringify(data), row.id as number);
                    }
                }
                this.db.db.exec('COMMIT');
                this.db.inTransaction = false;
                flushDatabaseEvents(this.db);
                /* c8 ignore next 4 */
            } catch (err) {
                if (this.db.inTransaction) {
                    this.db.db.exec('ROLLBACK');
                }
                this.db.pendingEvents.splice(pendingEventCount);
                throw err;
            } finally {
                this.db.inTransaction = false;
            }

            processed += rows.length;
            if (this.#emitEvents) {
                this.#emitter.emit('progress', {operation: 'prepareForExport', processed, total});
            }
        }
    }

    async transaction<T>(callback: () => T | Promise<T>): Promise<T> {
        if (this.db.inTransaction) {
            return await callback();
        }

        this.db.db.exec('BEGIN');
        this.db.inTransaction = true;
        const pendingEventCount = this.db.pendingEvents.length;
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
            this.db.pendingEvents.splice(pendingEventCount);
            throw err;
            /* c8 ignore next */
        } finally {
            this.db.inTransaction = false;
        }
    }

    #resolveFilterPostIds(filter?: PostFilter): number[] | null {
        if (!filter || (!filter.tag && !filter.author)) {
            return null;
        }

        let tagPostIds: Set<number> | null = null;
        let authorPostIds: Set<number> | null = null;

        if (filter.tag) {
            let tags: any[] = [];
            if (filter.tag.slug) {
                tags = this.db.stmts.findTagsBySlug.all(filter.tag.slug) as any[];
            } else if (filter.tag.name) {
                tags = this.db.stmts.findTagsByName.all(filter.tag.name) as any[];
            }
            tagPostIds = new Set<number>();
            for (const tag of tags) {
                const postTags = this.db.stmts.findPostTagsByTagId.all(tag.id) as any[];
                for (const pt of postTags) {
                    tagPostIds.add(pt.post_id as number);
                }
            }
        }

        if (filter.author) {
            let authors: any[] = [];
            if (filter.author.slug) {
                authors = this.db.stmts.findAuthorsBySlug.all(filter.author.slug) as any[];
            } else if (filter.author.name) {
                authors = this.db.stmts.findAuthorsByName.all(filter.author.name) as any[];
            } else if (filter.author.email) {
                authors = this.db.stmts.findAuthorsByEmail.all(filter.author.email) as any[];
            }
            authorPostIds = new Set<number>();
            for (const author of authors) {
                const postAuthors = this.db.stmts.findPostAuthorsByAuthorId.all(author.id) as any[];
                for (const pa of postAuthors) {
                    authorPostIds.add(pa.post_id as number);
                }
            }
        }

        let ids: number[];
        if (tagPostIds && authorPostIds) {
            ids = [...tagPostIds].filter(id => authorPostIds!.has(id));
        } else if (tagPostIds) {
            ids = [...tagPostIds];
        } else {
            ids = [...authorPostIds!];
        }

        return ids.sort((a, b) => a - b);
    }

    #buildFilterWhere(filter?: PostFilter) {
        const postIds = this.#resolveFilterPostIds(filter);
        const dateWhere = buildDateWhere(filter);
        return buildFullWhere(dateWhere, postIds);
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

        const where = this.#buildFilterWhere(filter);

        // Snapshot matching IDs up front so mutations during iteration
        // cannot shift pagination (e.g. changing a date or tag used in the filter).
        const allIds = findAllPostIdsWhere(this.db, where);
        const total = allIds.length;
        let processed = 0;

        for (let offset = 0; offset < total; offset += batchSize) {
            const batchIds = allIds.slice(offset, offset + batchSize);
            const rows = findPostsByIds(this.db, batchIds);

            for (const row of rows) {
                const post = PostContext.fromRow(row, this.db);
                await callback(post);
                withTransaction(this.db, () => {
                    post.save(this.db);
                });
                processed += 1;
            }

            if (this.#emitEvents) {
                this.#emitter.emit('progress', {operation: 'forEachPost', processed, total});
            }
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

        const where = this.#buildFilterWhere(filter);
        const allIds = findAllPostIdsWhere(this.db, where);

        yield* this.#streamByIds(
            allIds,
            batchSize,
            'streamPosts',
            ids => findPostsByIds(this.db, ids),
            row => PostContext.fromRow(row, this.db)
        );
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

    // eslint-disable-next-line no-unused-vars
    async *#streamByIds<T>(
        allIds: number[],
        batchSize: number,
        eventName: string,
        fetchBatch: (ids: number[]) => any[],
        toEntity: (row: any) => T
    ): AsyncGenerator<T> {
        const total = allIds.length;
        let processed = 0;

        for (let offset = 0; offset < total; offset += batchSize) {
            const batchIds = allIds.slice(offset, offset + batchSize);
            const rows = fetchBatch(batchIds);

            for (const row of rows) {
                yield toEntity(row);
                processed += 1;
            }

            if (this.#emitEvents) {
                this.#emitter.emit('progress', {operation: eventName, processed, total});
            }
        }
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

    /** Map and save one raw source record during ingestion. */
    async addSourcePost(mapPost: (post: PostContext) => void | Promise<void>): Promise<PostContext> {
        if (typeof mapPost !== 'function') {
            throw new errors.BadRequestError({message: 'addSourcePost requires a mapper function.'});
        }
        const post = new PostContext({onDuplicate: this.#onDuplicate});
        await mapPost(post);
        if (typeof post.lookupKey !== 'string' || !post.lookupKey.trim() || post.sourceContent === null) {
            throw new errors.BadRequestError({message: 'addSourcePost requires source lookupKey and content.'});
        }
        post.save(this.db);
        return post;
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
        const sanitizedStart = this.db.sanitizedFields.length;
        post.sanitize(this.db.sanitizedFields);
        const sanitized = this.db.sanitizedFields.slice(sanitizedStart);
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
        sourceAttr,
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
        } else if (sourceAttr && sourceAttr.key && sourceAttr.value) {
            const rows = this.db.stmts.findAllPostsOrdered.all() as any[];
            const results: PostContext[] = [];
            for (const row of rows) {
                const source = JSON.parse(row.source_meta as string);
                if (source[sourceAttr.key] === sourceAttr.value) {
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

    // eslint-disable-next-line no-unused-vars
    async writeGhostJson(
        outputDir: string,
        {
            batchSize = 5000,
            filename: rawFilename = 'posts',
            filter,
            onWrite,
            replaceExisting: _replaceExisting = true
        }: WriteGhostJsonOptions = {}
    ): Promise<WrittenFile[]> {
        const filename = exportBaseFilename(rawFilename);

        await this.prepareForExport();
        await mkdir(outputDir, {recursive: true});
        const manifest = await readExportManifest(outputDir);
        const manifestKey = 'posts';
        const where = this.#buildFilterWhere(filter);
        const count = countWhere(this.db, where);
        const totalBatches = Math.max(1, Math.ceil(count / batchSize));
        const currentFileNames = Array.from({length: totalBatches}, (_, batch) =>
            totalBatches === 1 ? `${filename}.json` : `${filename}-${batch + 1}.json`
        );
        const currentFileNameSet = new Set(currentFileNames);
        const previousFileNames = manifest.exports[manifestKey] ?? [];

        const writtenFiles: WrittenFile[] = [];
        const temporaryPaths: string[] = [];
        const pendingOutputs: Array<{temporaryPath: string; outputPath: string; written: WrittenFile}> = [];

        const subBatchSize = 200;

        try {
            for (let batch = 0; batch < totalBatches; batch++) {
                const batchOffset = batch * batchSize;
                const batchLimit = Math.min(batchSize, count - batchOffset);

                // Query post IDs and ghost IDs for this file batch
                const postIdRows = findPostIdColumnsWhere(this.db, where, batchLimit, batchOffset);
                const postIds = postIdRows.map((r: any) => r.id as number);
                const ghostIdMap = new Map<number, string>(postIdRows.map((r: any) => [r.id, r.ghost_id]));

                // Load junction + entity data from DB (small — tags/authors are few)
                const postTagRows = findByColumn(
                    this.db,
                    'PostTags',
                    'post_id',
                    postIds,
                    'post_id ASC, sort_order ASC'
                );
                const postAuthorRows = findByColumn(
                    this.db,
                    'PostAuthors',
                    'post_id',
                    postIds,
                    'post_id ASC, sort_order ASC'
                );

                const tagDbIds = [...new Set(postTagRows.map((r: any) => r.tag_id as number))];
                const authorDbIds = [...new Set(postAuthorRows.map((r: any) => r.author_id as number))];

                const tagRows = findByIds(this.db, 'Tags', tagDbIds);
                const authorRows = findByIds(this.db, 'Authors', authorDbIds);

                // Build small Ghost JSON arrays
                const tagGhostIds = new Map<number, string>();
                const tags = tagRows.map((r: any) => {
                    const data = JSON.parse(r.data);
                    tagGhostIds.set(r.id, r.ghost_id);
                    return {id: r.ghost_id, ...data};
                });
                const authorGhostIds = new Map<number, string>();
                const users = authorRows.map((r: any) => {
                    const data = JSON.parse(r.data);
                    authorGhostIds.set(r.id, r.ghost_id);
                    return {id: r.ghost_id, ...data};
                });

                const postsTags = postTagRows.map((r: any) => ({
                    post_id: ghostIdMap.get(r.post_id),
                    tag_id: tagGhostIds.get(r.tag_id),
                    sort_order: r.sort_order
                }));
                const postsAuthors = postAuthorRows.map((r: any) => ({
                    post_id: ghostIdMap.get(r.post_id),
                    author_id: authorGhostIds.get(r.author_id),
                    sort_order: r.sort_order
                }));

                // Stream file: posts are loaded and written in sub-batches
                const fileName = currentFileNames[batch];
                const outputPath = join(outputDir, fileName);
                const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
                temporaryPaths.push(temporaryPath);
                const fh = await open(temporaryPath, 'w');
                const postsMeta: any[] = [];
                let postCount = 0;

                // Indent a JSON.stringify block so all lines after the first are at the given depth
                const pretty = (obj: any, depth: number) => {
                    const pad = ' '.repeat(depth);
                    return JSON.stringify(obj, null, 2).replace(/\n/g, `\n${pad}`);
                };

                try {
                    await fh.write('{\n');
                    await fh.write(`  "meta": ${pretty({exported_on: Date.now(), version: '2.0.0'}, 2)},\n`);
                    await fh.write('  "data": {\n');
                    await fh.write('    "posts": [\n');

                    // Stream posts in sub-batches
                    for (let sub = 0; sub < batchLimit; sub += subBatchSize) {
                        const rows = findPostsWhere(
                            this.db,
                            where,
                            Math.min(subBatchSize, batchLimit - sub),
                            batchOffset + sub
                        );

                        for (const row of rows) {
                            const {post, meta} = PostContext.toGhostPost(row);

                            if (postCount > 0) {
                                await fh.write(',\n');
                            }
                            await fh.write(`      ${pretty(post, 6)}`);
                            if (meta) {
                                postsMeta.push(meta);
                            }
                            postCount += 1;
                        }
                    }

                    await fh.write('\n    ],\n');
                    await fh.write(`    "users": ${pretty(users, 4)},\n`);
                    await fh.write(`    "tags": ${pretty(tags, 4)},\n`);
                    await fh.write(`    "posts_authors": ${pretty(postsAuthors, 4)},\n`);
                    await fh.write(`    "posts_tags": ${pretty(postsTags, 4)},\n`);
                    await fh.write(`    "posts_meta": ${pretty(postsMeta, 4)}\n`);
                    await fh.write('  }\n}\n');
                } finally {
                    await fh.close();
                }

                const fileStats = await stat(temporaryPath);
                const written: WrittenFile = {
                    path: resolve(outputPath),
                    name: fileName,
                    size: fileStats.size,
                    posts: postCount
                };
                writtenFiles.push(written);
                pendingOutputs.push({temporaryPath, outputPath, written});
            }

            for (const {temporaryPath, outputPath} of pendingOutputs) {
                await rename(temporaryPath, outputPath);
            }

            for (const staleFileName of previousFileNames.filter(fileName => !currentFileNameSet.has(fileName))) {
                await rm(join(outputDir, staleFileName), {force: true});
            }

            manifest.exports[manifestKey] = currentFileNames;
            await writeExportManifest(outputDir, manifest);

            for (const written of writtenFiles) {
                if (onWrite) {
                    onWrite(written);
                }
                if (this.#emitEvents) {
                    this.#emitter.emit('export:file-written', structuredClone(written));
                }
            }

            return writtenFiles;
        } finally {
            for (const temporaryPath of temporaryPaths) {
                await rm(temporaryPath, {force: true});
            }
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

        const manifest = await readExportManifest(outputDir);
        try {
            await writeFile(temporaryPath, content);
            const fileStats = await stat(temporaryPath);
            const written = {path: resolve(outputPath), name, size: fileStats.size, posts: 0};
            await rename(temporaryPath, outputPath);
            for (const staleFileName of (manifest.exports.tags ?? []).filter(fileName => fileName !== name)) {
                await rm(join(outputDir, staleFileName), {force: true});
            }
            manifest.exports.tags = [name];
            await writeExportManifest(outputDir, manifest);
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

        const manifest = await readExportManifest(outputDir);
        try {
            await writeFile(temporaryPath, content);
            const fileStats = await stat(temporaryPath);
            const written = {path: resolve(outputPath), name, size: fileStats.size, posts: 0};
            await rename(temporaryPath, outputPath);
            for (const staleFileName of (manifest.exports.users ?? []).filter(fileName => fileName !== name)) {
                await rm(join(outputDir, staleFileName), {force: true});
            }
            manifest.exports.users = [name];
            await writeExportManifest(outputDir, manifest);
            if (this.#emitEvents) {
                this.#emitter.emit('export:file-written', structuredClone(written));
            }
            return written;
        } finally {
            await rm(temporaryPath, {force: true});
        }
    }
}
