export const SOURCE_SCHEMA = `
CREATE TABLE IF NOT EXISTS SourceIngestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL CHECK(status IN ('staging', 'complete', 'failed', 'retired')),
    metadata TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_active ON SourceIngestions(status) WHERE status = 'complete';
CREATE TABLE IF NOT EXISTS SourceRecords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingestion_id INTEGER NOT NULL REFERENCES SourceIngestions(id),
    kind TEXT NOT NULL,
    lookup_key TEXT,
    content TEXT NOT NULL,
    format TEXT NOT NULL,
    metadata TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_key ON SourceRecords(ingestion_id, kind, lookup_key) WHERE lookup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_source_iteration ON SourceRecords(ingestion_id, kind, id);
CREATE INDEX IF NOT EXISTS idx_source_generation ON SourceRecords(ingestion_id, id);
CREATE TABLE IF NOT EXISTS SourceEntityLinks (
    source_record_id INTEGER NOT NULL REFERENCES SourceRecords(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('post', 'tag', 'author')),
    entity_id INTEGER NOT NULL,
    PRIMARY KEY(source_record_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_source_entity ON SourceEntityLinks(entity_type, entity_id, source_record_id);
CREATE TRIGGER IF NOT EXISTS source_post_deleted AFTER DELETE ON Posts BEGIN
    DELETE FROM SourceEntityLinks WHERE entity_type = 'post' AND entity_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS source_tag_deleted AFTER DELETE ON Tags BEGIN
    DELETE FROM SourceEntityLinks WHERE entity_type = 'tag' AND entity_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS source_author_deleted AFTER DELETE ON Authors BEGIN
    DELETE FROM SourceEntityLinks WHERE entity_type = 'author' AND entity_id = OLD.id;
END;
CREATE TABLE IF NOT EXISTS PendingEvents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL
);
`;
