/* eslint-disable ghost/filenames/match-exported-class */
import {DatabaseSync} from 'node:sqlite';
import errors from '@tryghost/errors';

export const MIGRATE_CONTEXT_SCHEMA_VERSION = 3;

export type MigrationEventType =
    | 'post:inserted'
    | 'post:skipped'
    | 'post:replaced'
    | 'field:sanitized'
    | 'slug:renamed';

export interface DatabaseEvent {
    type: string;
    payload: unknown;
}

export interface SlugRename {
    oldSlug: string;
    newSlug: string;
    url: string;
}

/**
 * A value that was changed on its way into the database to satisfy Ghost's
 * schema — see MigrateBase.sanitize().
 */
export interface SanitizedField {
    /** Which context the value belongs to, e.g. "PostContext" */
    context: string;
    /** Slug of the post/tag/author the value belongs to, for locating it afterwards */
    slug: string;
    field: string;
    /** truncated: over Ghost's maximum length. trimmed: surrounding whitespace. replaced: rewritten to a valid value. */
    reason: 'truncated' | 'trimmed' | 'replaced';
    oldValue: string;
    newValue: string | null;
}

export interface DatabaseModels {
    db: DatabaseSync;
    stmts: PreparedStatements;
    schemaVersion: number;
    tagCache: Map<string, {dbId: number; ghostId: string}>;
    authorCache: Map<string, {dbId: number; ghostId: string}>;
    slugRenames: SlugRename[];
    sanitizedFields: SanitizedField[];
    inTransaction: boolean;
    pendingEvents: DatabaseEvent[];
    emitEvent: (event: DatabaseEvent) => void;
}

export interface PreparedStatements {
    // Lifecycle
    contentStats: ReturnType<DatabaseSync['prepare']>;
    getFingerprint: ReturnType<DatabaseSync['prepare']>;
    setFingerprint: ReturnType<DatabaseSync['prepare']>;
    deleteFingerprint: ReturnType<DatabaseSync['prepare']>;
    insertMigrationEvent: ReturnType<DatabaseSync['prepare']>;
    findMigrationEvents: ReturnType<DatabaseSync['prepare']>;
    countMigrationEventsByType: ReturnType<DatabaseSync['prepare']>;

    // Posts
    insertPost: ReturnType<DatabaseSync['prepare']>;
    updatePost: ReturnType<DatabaseSync['prepare']>;
    replacePost: ReturnType<DatabaseSync['prepare']>;
    updatePostData: ReturnType<DatabaseSync['prepare']>;
    patchPostData: ReturnType<DatabaseSync['prepare']>;
    updatePostWebscrapeData: ReturnType<DatabaseSync['prepare']>;
    updatePostSlug: ReturnType<DatabaseSync['prepare']>;
    findPostById: ReturnType<DatabaseSync['prepare']>;
    findPostByLookupKey: ReturnType<DatabaseSync['prepare']>;
    findPostsBySlug: ReturnType<DatabaseSync['prepare']>;
    findRenamedPosts: ReturnType<DatabaseSync['prepare']>;
    slugExists: ReturnType<DatabaseSync['prepare']>;
    slugExistsForOtherPost: ReturnType<DatabaseSync['prepare']>;
    findPostsForPreparation: ReturnType<DatabaseSync['prepare']>;
    countPosts: ReturnType<DatabaseSync['prepare']>;
    findMaxPostId: ReturnType<DatabaseSync['prepare']>;
    findPostsAfterId: ReturnType<DatabaseSync['prepare']>;
    findAllPostsOrdered: ReturnType<DatabaseSync['prepare']>;
    findPostsPaginated: ReturnType<DatabaseSync['prepare']>;

    // Tags
    insertTag: ReturnType<DatabaseSync['prepare']>;
    updateTagById: ReturnType<DatabaseSync['prepare']>;
    findTagById: ReturnType<DatabaseSync['prepare']>;
    findTagBySlug: ReturnType<DatabaseSync['prepare']>;
    findTagByName: ReturnType<DatabaseSync['prepare']>;
    findTagsBySlug: ReturnType<DatabaseSync['prepare']>;
    findTagsByName: ReturnType<DatabaseSync['prepare']>;
    findAllTags: ReturnType<DatabaseSync['prepare']>;
    findUsedTags: ReturnType<DatabaseSync['prepare']>;
    countAllTags: ReturnType<DatabaseSync['prepare']>;
    countUsedTags: ReturnType<DatabaseSync['prepare']>;
    findMaxTagId: ReturnType<DatabaseSync['prepare']>;
    findMaxUsedTagId: ReturnType<DatabaseSync['prepare']>;
    findTagsAfterId: ReturnType<DatabaseSync['prepare']>;
    findUsedTagsAfterId: ReturnType<DatabaseSync['prepare']>;
    tagIsUsed: ReturnType<DatabaseSync['prepare']>;

    // Authors
    insertAuthor: ReturnType<DatabaseSync['prepare']>;
    updateAuthorById: ReturnType<DatabaseSync['prepare']>;
    findAuthorById: ReturnType<DatabaseSync['prepare']>;
    findAuthorBySlug: ReturnType<DatabaseSync['prepare']>;
    findAuthorByName: ReturnType<DatabaseSync['prepare']>;
    findAuthorByEmail: ReturnType<DatabaseSync['prepare']>;
    findAuthorsBySlug: ReturnType<DatabaseSync['prepare']>;
    findAuthorsByName: ReturnType<DatabaseSync['prepare']>;
    findAuthorsByEmail: ReturnType<DatabaseSync['prepare']>;
    findAllAuthors: ReturnType<DatabaseSync['prepare']>;
    findUsedAuthors: ReturnType<DatabaseSync['prepare']>;
    countAllAuthors: ReturnType<DatabaseSync['prepare']>;
    countUsedAuthors: ReturnType<DatabaseSync['prepare']>;
    findMaxAuthorId: ReturnType<DatabaseSync['prepare']>;
    findMaxUsedAuthorId: ReturnType<DatabaseSync['prepare']>;
    findAuthorsAfterId: ReturnType<DatabaseSync['prepare']>;
    findUsedAuthorsAfterId: ReturnType<DatabaseSync['prepare']>;
    authorIsUsed: ReturnType<DatabaseSync['prepare']>;

    // PostTag junction
    insertPostTag: ReturnType<DatabaseSync['prepare']>;
    deletePostTagsByPostId: ReturnType<DatabaseSync['prepare']>;
    findPostTagsByPostId: ReturnType<DatabaseSync['prepare']>;
    findPostTagsByTagId: ReturnType<DatabaseSync['prepare']>;

    // PostAuthor junction
    insertPostAuthor: ReturnType<DatabaseSync['prepare']>;
    deletePostAuthorsByPostId: ReturnType<DatabaseSync['prepare']>;
    findPostAuthorsByPostId: ReturnType<DatabaseSync['prepare']>;
    findPostAuthorsByAuthorId: ReturnType<DatabaseSync['prepare']>;

    // Links
    insertLink: ReturnType<DatabaseSync['prepare']>;
    findLink: ReturnType<DatabaseSync['prepare']>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS Posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    source TEXT DEFAULT '{}',
    meta TEXT DEFAULT '{}',
    lookup_key TEXT,
    ghost_id TEXT,
    created_at TEXT,
    updated_at TEXT,
    published_at TEXT,
    original_slug TEXT,
    slug TEXT,
    webscrape_data TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_lookup_key ON Posts(lookup_key);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON Posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON Posts(published_at);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON Posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_original_slug ON Posts(original_slug);

CREATE TABLE IF NOT EXISTS Tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    slug TEXT,
    name TEXT,
    ghost_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_tags_slug ON Tags(slug);
CREATE INDEX IF NOT EXISTS idx_tags_name ON Tags(name);

CREATE TABLE IF NOT EXISTS Authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    slug TEXT,
    name TEXT,
    email TEXT,
    ghost_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_authors_slug ON Authors(slug);
CREATE INDEX IF NOT EXISTS idx_authors_name ON Authors(name);
CREATE INDEX IF NOT EXISTS idx_authors_email ON Authors(email);

CREATE TABLE IF NOT EXISTS PostTags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_posttags_post_id ON PostTags(post_id);
CREATE INDEX IF NOT EXISTS idx_posttags_tag_id ON PostTags(tag_id);

CREATE TABLE IF NOT EXISTS PostAuthors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_postauthors_post_id ON PostAuthors(post_id);
CREATE INDEX IF NOT EXISTS idx_postauthors_author_id ON PostAuthors(author_id);

CREATE TABLE IF NOT EXISTS Links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    old_url TEXT NOT NULL,
    new_url TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_links_old_url ON Links(old_url);

CREATE TABLE IF NOT EXISTS Fingerprints (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS MigrationEvents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    post_id INTEGER,
    lookup_key TEXT,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_migrationevents_type ON MigrationEvents(type);
`;

function prepareStatements(db: DatabaseSync): PreparedStatements {
    return {
        // Lifecycle
        contentStats: db.prepare(
            `SELECT
                COUNT(CASE WHEN COALESCE(json_extract(data, '$.type'), 'post') = 'post' THEN 1 END) AS posts,
                COUNT(CASE WHEN json_extract(data, '$.type') = 'page' THEN 1 END) AS pages,
                (SELECT COUNT(*) FROM Authors) AS users,
                (SELECT COUNT(*) FROM Tags) AS tags,
                (SELECT COUNT(*) FROM PostAuthors) AS post_user_associations,
                (SELECT COUNT(*) FROM PostTags) AS post_tag_associations,
                (SELECT COUNT(*) FROM Links) AS links
            FROM Posts`
        ),
        getFingerprint: db.prepare('SELECT value FROM Fingerprints WHERE name = ?'),
        setFingerprint: db.prepare(
            'INSERT INTO Fingerprints (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value'
        ),
        deleteFingerprint: db.prepare('DELETE FROM Fingerprints WHERE name = ?'),
        insertMigrationEvent: db.prepare(
            'INSERT INTO MigrationEvents (type, post_id, lookup_key, details, created_at) VALUES (?, ?, ?, ?, ?)'
        ),
        findMigrationEvents: db.prepare('SELECT * FROM MigrationEvents ORDER BY id ASC'),
        countMigrationEventsByType: db.prepare(
            'SELECT type, COUNT(*) AS count FROM MigrationEvents GROUP BY type ORDER BY type ASC'
        ),

        // Posts
        insertPost: db.prepare(
            'INSERT INTO Posts (data, source, meta, lookup_key, ghost_id, created_at, updated_at, published_at, original_slug, slug, webscrape_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ),
        updatePost: db.prepare(
            'UPDATE Posts SET data = ?, source = ?, meta = ?, lookup_key = ?, ghost_id = ?, created_at = ?, updated_at = ?, published_at = ?, slug = ?, webscrape_data = ? WHERE id = ?'
        ),
        replacePost: db.prepare(
            'UPDATE Posts SET data = ?, source = ?, meta = ?, lookup_key = ?, ghost_id = ?, created_at = ?, updated_at = ?, published_at = ?, original_slug = ?, slug = ?, webscrape_data = ? WHERE id = ?'
        ),
        updatePostData: db.prepare('UPDATE Posts SET data = ? WHERE id = ?'),
        patchPostData: db.prepare(
            'UPDATE Posts SET data = ?, created_at = ?, updated_at = ?, published_at = ? WHERE id = ?'
        ),
        updatePostWebscrapeData: db.prepare('UPDATE Posts SET webscrape_data = ? WHERE id = ?'),
        updatePostSlug: db.prepare('UPDATE Posts SET slug = ?, data = ? WHERE id = ?'),
        findPostById: db.prepare('SELECT * FROM Posts WHERE id = ?'),
        findPostByLookupKey: db.prepare('SELECT * FROM Posts WHERE lookup_key = ?'),
        findPostsBySlug: db.prepare('SELECT * FROM Posts WHERE slug = ? ORDER BY id ASC'),
        findRenamedPosts: db.prepare(
            'SELECT id, slug, original_slug, source, data FROM Posts WHERE original_slug IS NOT NULL AND original_slug <> slug ORDER BY id ASC'
        ),
        slugExists: db.prepare('SELECT 1 FROM Posts WHERE slug = ? LIMIT 1'),
        slugExistsForOtherPost: db.prepare('SELECT 1 FROM Posts WHERE slug = ? AND id <> ? LIMIT 1'),
        findPostsForPreparation: db.prepare('SELECT id, data FROM Posts ORDER BY id ASC LIMIT ? OFFSET ?'),
        countPosts: db.prepare('SELECT COUNT(*) as count FROM Posts'),
        findMaxPostId: db.prepare('SELECT MAX(id) AS max_id FROM Posts'),
        findPostsAfterId: db.prepare('SELECT * FROM Posts WHERE id > ? AND id <= ? ORDER BY id ASC LIMIT ?'),
        findAllPostsOrdered: db.prepare('SELECT * FROM Posts ORDER BY id ASC'),
        findPostsPaginated: db.prepare('SELECT * FROM Posts ORDER BY id ASC LIMIT ? OFFSET ?'),

        // Tags
        insertTag: db.prepare('INSERT INTO Tags (data, slug, name, ghost_id) VALUES (?, ?, ?, ?)'),
        updateTagById: db.prepare('UPDATE Tags SET data = ?, slug = ?, name = ?, ghost_id = ? WHERE id = ?'),
        findTagById: db.prepare('SELECT * FROM Tags WHERE id = ?'),
        findTagBySlug: db.prepare('SELECT * FROM Tags WHERE slug = ? LIMIT 1'),
        findTagByName: db.prepare('SELECT * FROM Tags WHERE name = ? LIMIT 1'),
        findTagsBySlug: db.prepare('SELECT * FROM Tags WHERE slug = ?'),
        findTagsByName: db.prepare('SELECT * FROM Tags WHERE name = ?'),
        findAllTags: db.prepare('SELECT * FROM Tags'),
        findUsedTags: db.prepare(
            'SELECT DISTINCT t.* FROM Tags t INNER JOIN PostTags pt ON t.id = pt.tag_id ORDER BY t.id ASC'
        ),
        countAllTags: db.prepare('SELECT COUNT(*) AS count FROM Tags'),
        countUsedTags: db.prepare(
            'SELECT COUNT(DISTINCT t.id) AS count FROM Tags t INNER JOIN PostTags pt ON t.id = pt.tag_id'
        ),
        findMaxUsedTagId: db.prepare(
            'SELECT MAX(t.id) AS max_id FROM Tags t INNER JOIN PostTags pt ON t.id = pt.tag_id'
        ),
        findMaxTagId: db.prepare('SELECT MAX(id) AS max_id FROM Tags'),
        findTagsAfterId: db.prepare('SELECT * FROM Tags WHERE id > ? AND id <= ? ORDER BY id ASC LIMIT ?'),
        findUsedTagsAfterId: db.prepare(
            'SELECT DISTINCT t.* FROM Tags t INNER JOIN PostTags pt ON t.id = pt.tag_id WHERE t.id > ? AND t.id <= ? ORDER BY t.id ASC LIMIT ?'
        ),
        tagIsUsed: db.prepare('SELECT 1 FROM PostTags WHERE tag_id = ? LIMIT 1'),

        // Authors
        insertAuthor: db.prepare('INSERT INTO Authors (data, slug, name, email, ghost_id) VALUES (?, ?, ?, ?, ?)'),
        updateAuthorById: db.prepare(
            'UPDATE Authors SET data = ?, slug = ?, name = ?, email = ?, ghost_id = ? WHERE id = ?'
        ),
        findAuthorById: db.prepare('SELECT * FROM Authors WHERE id = ?'),
        findAuthorBySlug: db.prepare('SELECT * FROM Authors WHERE slug = ? LIMIT 1'),
        findAuthorByName: db.prepare('SELECT * FROM Authors WHERE name = ? LIMIT 1'),
        findAuthorByEmail: db.prepare('SELECT * FROM Authors WHERE email = ? LIMIT 1'),
        findAuthorsBySlug: db.prepare('SELECT * FROM Authors WHERE slug = ?'),
        findAuthorsByName: db.prepare('SELECT * FROM Authors WHERE name = ?'),
        findAuthorsByEmail: db.prepare('SELECT * FROM Authors WHERE email = ?'),
        findAllAuthors: db.prepare('SELECT * FROM Authors'),
        findUsedAuthors: db.prepare(
            'SELECT DISTINCT a.* FROM Authors a INNER JOIN PostAuthors pa ON a.id = pa.author_id ORDER BY a.id ASC'
        ),
        countAllAuthors: db.prepare('SELECT COUNT(*) AS count FROM Authors'),
        countUsedAuthors: db.prepare(
            'SELECT COUNT(DISTINCT a.id) AS count FROM Authors a INNER JOIN PostAuthors pa ON a.id = pa.author_id'
        ),
        findMaxUsedAuthorId: db.prepare(
            'SELECT MAX(a.id) AS max_id FROM Authors a INNER JOIN PostAuthors pa ON a.id = pa.author_id'
        ),
        findMaxAuthorId: db.prepare('SELECT MAX(id) AS max_id FROM Authors'),
        findAuthorsAfterId: db.prepare('SELECT * FROM Authors WHERE id > ? AND id <= ? ORDER BY id ASC LIMIT ?'),
        findUsedAuthorsAfterId: db.prepare(
            'SELECT DISTINCT a.* FROM Authors a INNER JOIN PostAuthors pa ON a.id = pa.author_id WHERE a.id > ? AND a.id <= ? ORDER BY a.id ASC LIMIT ?'
        ),
        authorIsUsed: db.prepare('SELECT 1 FROM PostAuthors WHERE author_id = ? LIMIT 1'),

        // PostTag junction
        insertPostTag: db.prepare('INSERT INTO PostTags (post_id, tag_id, sort_order) VALUES (?, ?, ?)'),
        deletePostTagsByPostId: db.prepare('DELETE FROM PostTags WHERE post_id = ?'),
        findPostTagsByPostId: db.prepare('SELECT * FROM PostTags WHERE post_id = ? ORDER BY sort_order ASC'),
        findPostTagsByTagId: db.prepare('SELECT * FROM PostTags WHERE tag_id = ?'),

        // PostAuthor junction
        insertPostAuthor: db.prepare('INSERT INTO PostAuthors (post_id, author_id, sort_order) VALUES (?, ?, ?)'),
        deletePostAuthorsByPostId: db.prepare('DELETE FROM PostAuthors WHERE post_id = ?'),
        findPostAuthorsByPostId: db.prepare('SELECT * FROM PostAuthors WHERE post_id = ? ORDER BY sort_order ASC'),
        findPostAuthorsByAuthorId: db.prepare('SELECT * FROM PostAuthors WHERE author_id = ?'),

        // Links
        insertLink: db.prepare('INSERT OR IGNORE INTO Links (old_url, new_url) VALUES (?, ?)'),
        findLink: db.prepare('SELECT new_url FROM Links WHERE old_url = ? LIMIT 1')
    };
}

export function createDatabase(dbPath: string): DatabaseModels {
    const db = new DatabaseSync(dbPath);

    const existingVersion = (db.prepare('PRAGMA user_version').get() as {user_version: number}).user_version;
    const hasExistingSchema = Boolean(
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Posts' LIMIT 1").get()
    );

    // Version 2 is the first compatibility baseline.
    if (existingVersion === 0 && hasExistingSchema) {
        db.close();
        throw new errors.InternalServerError({
            message: `Unversioned migration databases are not supported. Recreate the database from source.`
        });
    }

    if (existingVersion > 0 && existingVersion < 2) {
        db.close();
        throw new errors.InternalServerError({
            message: `Database schema version ${existingVersion} is older than the supported version ${MIGRATE_CONTEXT_SCHEMA_VERSION}. Recreate the database from source.`
        });
    }

    if (existingVersion > MIGRATE_CONTEXT_SCHEMA_VERSION) {
        db.close();
        throw new errors.InternalServerError({
            message: `Database schema version ${existingVersion} is newer than the supported version ${MIGRATE_CONTEXT_SCHEMA_VERSION}.`
        });
    }

    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA cache_size = -64000;');
    db.exec('PRAGMA temp_store = MEMORY;');

    if (existingVersion === 2) {
        db.exec(`
            BEGIN;
            CREATE TABLE MigrationEvents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                post_id INTEGER,
                lookup_key TEXT,
                details TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );
            CREATE INDEX idx_migrationevents_type ON MigrationEvents(type);
            PRAGMA user_version = 3;
            COMMIT;
        `);
    }

    db.exec(SCHEMA);

    if (existingVersion === 0) {
        db.exec(`PRAGMA user_version = ${MIGRATE_CONTEXT_SCHEMA_VERSION};`);
    }

    const stmts = prepareStatements(db);

    return {
        db,
        stmts,
        schemaVersion: MIGRATE_CONTEXT_SCHEMA_VERSION,
        tagCache: new Map(),
        authorCache: new Map(),
        slugRenames: [],
        sanitizedFields: [],
        inTransaction: false,
        pendingEvents: [],
        /* c8 ignore next -- replaced by MigrateContext immediately after initialization */
        emitEvent: () => {}
    };
}

export function queueDatabaseEvent(db: DatabaseModels, event: DatabaseEvent): void {
    if (db.inTransaction) {
        db.pendingEvents.push(event);
        return;
    }
    db.emitEvent(event);
}

export function flushDatabaseEvents(db: DatabaseModels): void {
    const events = db.pendingEvents.splice(0);
    for (const event of events) {
        db.emitEvent(event);
    }
}

export function recordMigrationEvent(
    db: DatabaseModels,
    type: MigrationEventType,
    {
        postId = null,
        lookupKey = null,
        details = {},
        liveEvent
    }: {postId?: number | null; lookupKey?: string | null; details?: unknown; liveEvent?: DatabaseEvent}
): void {
    db.stmts.insertMigrationEvent.run(type, postId, lookupKey, JSON.stringify(details), new Date().toISOString());
    if (liveEvent) {
        queueDatabaseEvent(db, liveEvent);
    }
}

export function recordSanitizedFields(db: DatabaseModels, fields: SanitizedField[]): void {
    for (const field of fields) {
        recordMigrationEvent(db, 'field:sanitized', {
            details: field,
            liveEvent: {type: 'field:sanitized', payload: structuredClone(field)}
        });
    }
}
