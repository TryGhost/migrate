import type MigrateContext from './MigrateContext.js';
import type {SourceRecord} from './SourceRecords.js';
import {GHOST_FIELD_LIMITS} from './ghost-schema.js';

type Statement = ReturnType<MigrateContext['db']['db']['prepare']>;

/**
 * Disk-backed scratch state for one mapping run: a key-value store, an index from lookup keys to source
 * records, and source-key → mapped entity bindings. It lives in SQLite temp tables, so large sources do not
 * hold their lookups in memory. Creating a state clears any earlier state with the same name.
 */
export default class MappingState {
    readonly context: MigrateContext;
    readonly name: string;
    #get: Statement;
    #set: Statement;
    #index: Statement;
    #find: Statement;

    constructor(context: MigrateContext, name: string) {
        this.context = context;
        this.name = name;
        const db = context.db.db;
        db.exec(`CREATE TEMP TABLE IF NOT EXISTS MappingValues(scope TEXT, namespace TEXT, key TEXT, value TEXT, PRIMARY KEY(scope, namespace, key));
            CREATE TEMP TABLE IF NOT EXISTS MappingIndex(scope TEXT, kind TEXT, key TEXT, record_id INTEGER, PRIMARY KEY(scope, kind, key, record_id));`);
        db.prepare('DELETE FROM MappingValues WHERE scope = ?').run(name);
        db.prepare('DELETE FROM MappingIndex WHERE scope = ?').run(name);
        this.#get = db.prepare('SELECT value FROM MappingValues WHERE scope = ? AND namespace = ? AND key = ?');
        this.#set = db.prepare('INSERT OR REPLACE INTO MappingValues VALUES (?, ?, ?, ?)');
        this.#index = db.prepare('INSERT OR IGNORE INTO MappingIndex VALUES (?, ?, ?, ?)');
        this.#find = db.prepare(
            'SELECT record_id FROM MappingIndex WHERE scope = ? AND kind = ? AND key = ? ORDER BY record_id LIMIT ?'
        );
    }

    get(namespace: string, key: string): any {
        const row = this.#get.get(this.name, namespace, key) as {value: string} | undefined;
        return row ? JSON.parse(row.value) : undefined;
    }

    set(namespace: string, key: string, value: unknown): void {
        this.#set.run(this.name, namespace, key, JSON.stringify(value));
    }

    /** Remember which mapped entity (database ID) a source key produced. */
    bind(kind: string, key: string, id: number): void {
        this.set(`binding:${kind}`, key, id);
    }

    getBinding(kind: string, key: string): number | undefined {
        return this.get(`binding:${kind}`, key);
    }

    /** Index a completed source record under a lookup key. One key may index several records. */
    index(kind: string, key: string, recordId: number): void {
        this.#index.run(this.name, kind, key, recordId);
    }

    /** Records indexed under a key, oldest first. The default limit of 2 is enough to detect ambiguity. */
    find(kind: string, key: string, limit = 2): SourceRecord[] {
        const rows = this.#find.all(this.name, kind, key, limit) as {record_id: number}[];
        return rows.map(row => this.context.sources.getById(row.record_id)!);
    }

    /** Hold a slug for one owner, such as an existing Ghost user, so other entities are suffixed around it. */
    reserveSlug(kind: 'author' | 'tag', slug: string, ownerId: string): void {
        this.set(`slug-reserved:${kind}`, slug, ownerId);
    }

    /**
     * A slug no other mapped author/tag uses, clamped to Ghost's length limit. Saving a tag or author reuses
     * any row with the same slug, so distinct source entities that share a slug need this before saving.
     * Records a `slug:renamed` diagnostic when the slug changes.
     */
    uniqueSlug(kind: 'author' | 'tag', desired: string, ownerId?: string): string {
        const db = this.context.db;
        const limit = GHOST_FIELD_LIMITS[kind].slug;
        const base = (desired.trim() || kind).slice(0, limit).trim().replace(/-+$/, '') || kind;
        const find = kind === 'author' ? db.stmts.findAuthorBySlug : db.stmts.findTagBySlug;
        let candidate = base;
        let suffix = this.get(`slug:${kind}`, base) ?? 1;
        const occupied = (value: string) => {
            const reserved = this.get(`slug-reserved:${kind}`, value);
            return find.get(value) || Boolean(reserved && reserved !== ownerId);
        };
        while (occupied(candidate)) {
            const tail = `-${++suffix}`;
            candidate = base.slice(0, limit - tail.length).replace(/-+$/, '') + tail;
        }
        this.set(`slug:${kind}`, base, suffix);
        if (candidate !== base) {
            this.context.recordDiagnostic('slug:renamed', {entityKind: kind, oldSlug: base, newSlug: candidate});
        }
        return candidate;
    }
}
