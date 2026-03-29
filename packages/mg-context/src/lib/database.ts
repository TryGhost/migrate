/* eslint-disable ghost/filenames/match-exported-class */
import {DatabaseSync} from 'node:sqlite';

export interface DatabaseModels {
    db: DatabaseSync;
    stmts: PreparedStatements;
    tagCache: Map<string, {dbId: number; ghostId: string}>;
    authorCache: Map<string, {dbId: number; ghostId: string}>;
    inTransaction: boolean;
}

export interface PreparedStatements {
    // Posts
    insertPost: ReturnType<DatabaseSync['prepare']>;
    updatePost: ReturnType<DatabaseSync['prepare']>;
    updatePostData: ReturnType<DatabaseSync['prepare']>;
    findPostById: ReturnType<DatabaseSync['prepare']>;
    findPostByLookupKey: ReturnType<DatabaseSync['prepare']>;
    countPosts: ReturnType<DatabaseSync['prepare']>;
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
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS Posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    source TEXT DEFAULT '{}',
    meta TEXT DEFAULT '{}',
    content_format TEXT DEFAULT 'html',
    lookup_key TEXT,
    ghost_id TEXT,
    created_at TEXT,
    updated_at TEXT,
    published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_lookup_key ON Posts(lookup_key);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON Posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON Posts(published_at);

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
`;

function prepareStatements(db: DatabaseSync): PreparedStatements {
    return {
        // Posts
        insertPost: db.prepare('INSERT INTO Posts (data, source, meta, content_format, lookup_key, ghost_id, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
        updatePost: db.prepare('UPDATE Posts SET data = ?, source = ?, meta = ?, content_format = ?, lookup_key = ?, ghost_id = ?, created_at = ?, updated_at = ?, published_at = ? WHERE id = ?'),
        updatePostData: db.prepare('UPDATE Posts SET data = ? WHERE id = ?'),
        findPostById: db.prepare('SELECT * FROM Posts WHERE id = ?'),
        findPostByLookupKey: db.prepare('SELECT * FROM Posts WHERE lookup_key = ?'),
        countPosts: db.prepare('SELECT COUNT(*) as count FROM Posts'),
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
        findUsedTags: db.prepare('SELECT DISTINCT t.* FROM Tags t INNER JOIN PostTags pt ON t.id = pt.tag_id'),

        // Authors
        insertAuthor: db.prepare('INSERT INTO Authors (data, slug, name, email, ghost_id) VALUES (?, ?, ?, ?, ?)'),
        updateAuthorById: db.prepare('UPDATE Authors SET data = ?, slug = ?, name = ?, email = ?, ghost_id = ? WHERE id = ?'),
        findAuthorById: db.prepare('SELECT * FROM Authors WHERE id = ?'),
        findAuthorBySlug: db.prepare('SELECT * FROM Authors WHERE slug = ? LIMIT 1'),
        findAuthorByName: db.prepare('SELECT * FROM Authors WHERE name = ? LIMIT 1'),
        findAuthorByEmail: db.prepare('SELECT * FROM Authors WHERE email = ? LIMIT 1'),
        findAuthorsBySlug: db.prepare('SELECT * FROM Authors WHERE slug = ?'),
        findAuthorsByName: db.prepare('SELECT * FROM Authors WHERE name = ?'),
        findAuthorsByEmail: db.prepare('SELECT * FROM Authors WHERE email = ?'),
        findAllAuthors: db.prepare('SELECT * FROM Authors'),
        findUsedAuthors: db.prepare('SELECT DISTINCT a.* FROM Authors a INNER JOIN PostAuthors pa ON a.id = pa.author_id'),

        // PostTag junction
        insertPostTag: db.prepare('INSERT INTO PostTags (post_id, tag_id, sort_order) VALUES (?, ?, ?)'),
        deletePostTagsByPostId: db.prepare('DELETE FROM PostTags WHERE post_id = ?'),
        findPostTagsByPostId: db.prepare('SELECT * FROM PostTags WHERE post_id = ? ORDER BY sort_order ASC'),
        findPostTagsByTagId: db.prepare('SELECT * FROM PostTags WHERE tag_id = ?'),

        // PostAuthor junction
        insertPostAuthor: db.prepare('INSERT INTO PostAuthors (post_id, author_id, sort_order) VALUES (?, ?, ?)'),
        deletePostAuthorsByPostId: db.prepare('DELETE FROM PostAuthors WHERE post_id = ?'),
        findPostAuthorsByPostId: db.prepare('SELECT * FROM PostAuthors WHERE post_id = ? ORDER BY sort_order ASC'),
        findPostAuthorsByAuthorId: db.prepare('SELECT * FROM PostAuthors WHERE author_id = ?')
    };
}

export function createDatabase(dbPath: string): DatabaseModels {
    const db = new DatabaseSync(dbPath);

    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA cache_size = -64000;');
    db.exec('PRAGMA temp_store = MEMORY;');

    db.exec(SCHEMA);

    const stmts = prepareStatements(db);

    return {db, stmts, tagCache: new Map(), authorCache: new Map(), inTransaction: false};
}
