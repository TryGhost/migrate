/**
 * Frozen schema-v2 database fixture. Keep this independent from the production
 * schema so migration tests prove that old databases are upgraded in place.
 */
export const MG_CONTEXT_V2_SCHEMA = `
CREATE TABLE Posts (
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
CREATE TABLE Tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    slug TEXT,
    name TEXT,
    ghost_id TEXT
);
CREATE TABLE Authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    slug TEXT,
    name TEXT,
    email TEXT,
    ghost_id TEXT
);
CREATE TABLE PostTags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE PostAuthors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE Links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    old_url TEXT NOT NULL,
    new_url TEXT NOT NULL
);
CREATE TABLE Fingerprints (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
PRAGMA user_version = 2;
`;
