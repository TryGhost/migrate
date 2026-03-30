/* eslint-disable ghost/filenames/match-exported-class */
import {DatabaseSync} from 'node:sqlite';

export interface AssetCacheStatements {
    insertAsset: ReturnType<DatabaseSync['prepare']>;
    findBySrc: ReturnType<DatabaseSync['prepare']>;
    findById: ReturnType<DatabaseSync['prepare']>;
    findAll: ReturnType<DatabaseSync['prepare']>;
    updateStatus: ReturnType<DatabaseSync['prepare']>;
    updateLocalPath: ReturnType<DatabaseSync['prepare']>;
    updateSkip: ReturnType<DatabaseSync['prepare']>;
}

export interface AssetCacheDatabase {
    db: DatabaseSync;
    stmts: AssetCacheStatements;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS Assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    src TEXT NOT NULL,
    status INTEGER,
    localPath TEXT,
    skip TEXT,
    createdAt TEXT,
    updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_assets_src ON Assets(src);
`;

function prepareStatements(db: DatabaseSync): AssetCacheStatements {
    return {
        insertAsset: db.prepare('INSERT INTO Assets (src, createdAt, updatedAt) VALUES (?, datetime(\'now\'), datetime(\'now\'))'),
        findBySrc: db.prepare('SELECT * FROM Assets WHERE src = ? LIMIT 1'),
        findById: db.prepare('SELECT * FROM Assets WHERE id = ?'),
        findAll: db.prepare('SELECT * FROM Assets'),
        updateStatus: db.prepare('UPDATE Assets SET status = ?, updatedAt = datetime(\'now\') WHERE id = ?'),
        updateLocalPath: db.prepare('UPDATE Assets SET localPath = ?, updatedAt = datetime(\'now\') WHERE id = ?'),
        updateSkip: db.prepare('UPDATE Assets SET skip = ?, updatedAt = datetime(\'now\') WHERE id = ?')
    };
}

/**
 * Adds missing timestamp columns to an existing Assets table.
 * Handles DBs created before timestamps were added to the schema.
 */
function migrateSchema(db: DatabaseSync): void {
    const tableExists = db.prepare(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='Assets'"
    ).get() as any;

    if (!tableExists || tableExists.count === 0) {
        return;
    }

    const hasCreatedAt = db.prepare(
        "SELECT COUNT(*) as count FROM pragma_table_info('Assets') WHERE name='createdAt'"
    ).get() as any;

    if (!hasCreatedAt || hasCreatedAt.count === 0) {
        db.exec('ALTER TABLE Assets ADD COLUMN createdAt TEXT');
        db.exec('ALTER TABLE Assets ADD COLUMN updatedAt TEXT');
    }
}

export function createAssetCacheDatabase(dbPath: string): AssetCacheDatabase {
    const db = new DatabaseSync(dbPath);

    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA cache_size = -64000;');
    db.exec('PRAGMA temp_store = MEMORY;');

    migrateSchema(db);

    db.exec(SCHEMA);

    const stmts = prepareStatements(db);

    return {db, stmts};
}

export function resetAssetCacheDatabase(database: AssetCacheDatabase): void {
    database.db.exec('DROP TABLE IF EXISTS Assets');
    database.db.exec(SCHEMA);
    database.stmts = prepareStatements(database.db);
}
