import MigrateBase from './lib/MigrateBase.js';
import MigrateContext from './lib/MigrateContext.js';
import PostContext, {normalizeTitle} from './lib/PostContext.js';
import TagContext from './lib/TagContext.js';
import AuthorContext from './lib/AuthorContext.js';

export default MigrateContext;

export {MigrateBase, MigrateContext, PostContext, TagContext, AuthorContext, normalizeTitle};
export {MIGRATE_CONTEXT_SCHEMA_VERSION} from './lib/database.js';
export {GHOST_FIELD_LIMITS, GHOST_SCHEMA_SOURCE, GHOST_SCHEMA_VERSION} from './lib/ghost-schema.js';
export type {JsonValue, JsonObject} from './lib/json.js';
export {default as SourceRecords, SourceIngestion} from './lib/SourceRecords.js';
export type {
    SourceRecord,
    SourceRecordInput,
    SourceEntity,
    SourceIterationOptions,
    SourceWriteOptions,
    SourceBatchOptions,
    IngestOptions,
    IngestionInfo
} from './lib/SourceRecords.js';

export type {
    WrittenFile,
    ForEachPostOptions,
    PostFilter,
    DuplicateSlugEntry,
    ContentStats,
    UpdatePostDataOptions,
    WriteGhostJsonOptions,
    WriteGhostCSVOptions,
    MigrateContextOptions,
    EntityScope,
    EntityIterationOptions,
    FindTagsOptions,
    FindAuthorsOptions,
    ProgressEvent,
    PostSkippedEvent,
    PostReplacedEvent,
    SanitizedFieldEvent,
    SlugRenamedEvent,
    ExportFileWrittenEvent,
    MigrateContextEventMap,
    MigrationReport,
    MigrationReportEntry
} from './lib/MigrateContext.js';
export type {
    DuplicatePostAction,
    DuplicatePostPolicy,
    DuplicatePostResolver,
    PostConstructorOptions,
    PostDataPatch,
    PostObject,
    PostSnapshot
} from './lib/PostContext.js';
export type {SanitizedField, SlugRename, MigrationEventType} from './lib/database.js';
