import MigrateBase from './lib/MigrateBase.js';
import MigrateContext from './lib/MigrateContext.js';
import PostContext, {normalizeTitle} from './lib/PostContext.js';
import TagContext from './lib/TagContext.js';
import AuthorContext from './lib/AuthorContext.js';

export default MigrateContext;

export {MigrateBase, MigrateContext, PostContext, TagContext, AuthorContext, normalizeTitle};
export {MIGRATE_CONTEXT_SCHEMA_VERSION} from './lib/database.js';
export {GHOST_FIELD_LIMITS, GHOST_SCHEMA_SOURCE, GHOST_SCHEMA_VERSION} from './lib/ghost-schema.js';

export type {
    WrittenFile,
    ForEachPostOptions,
    PostFilter,
    DuplicateSlugEntry,
    ResetOptions,
    ContentStats,
    UpdatePostDataOptions
} from './lib/MigrateContext.js';
export type {
    DuplicatePostAction,
    DuplicatePostPolicy,
    DuplicatePostResolver,
    PostConstructorOptions,
    PostDataPatch,
    PostObject
} from './lib/PostContext.js';
export type {SanitizedField, SlugRename} from './lib/database.js';
