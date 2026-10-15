import {z} from 'zod/v4';
import {randomBytes} from 'node:crypto';
import MigrateBase from './MigrateBase.js';
import {GHOST_FIELD_LIMITS} from './ghost-schema.js';
import {recordSanitizedFields, type DatabaseModels} from './database.js';

const TAG_LIMITS = GHOST_FIELD_LIMITS.tag;

const tagZodSchema = z.object({
    name: z.string().max(TAG_LIMITS.name),
    slug: z.string().max(TAG_LIMITS.slug),
    description: z.string().max(TAG_LIMITS.description).nullable(),
    feature_image: z.string().max(TAG_LIMITS.feature_image).nullable(),
    og_image: z.string().max(TAG_LIMITS.og_image).nullable(),
    og_title: z.string().max(TAG_LIMITS.og_title).nullable(),
    og_description: z.string().max(TAG_LIMITS.og_description).nullable(),
    twitter_image: z.string().max(TAG_LIMITS.twitter_image).nullable(),
    twitter_title: z.string().max(TAG_LIMITS.twitter_title).nullable(),
    twitter_description: z.string().max(TAG_LIMITS.twitter_description).nullable(),
    meta_title: z.string().max(TAG_LIMITS.meta_title).nullable(),
    meta_description: z.string().max(TAG_LIMITS.meta_description).nullable(),
    codeinjection_head: z.string().max(TAG_LIMITS.codeinjection_head).nullable(),
    codeinjection_foot: z.string().max(TAG_LIMITS.codeinjection_foot).nullable(),
    canonical_url: z.string().max(TAG_LIMITS.canonical_url).nullable()
});

export type TagObject = z.infer<typeof tagZodSchema>;

export type TagDataObject = {
    data: TagObject;
};

const TAG_URL_FIELDS: ReadonlySet<string> = new Set(['feature_image', 'og_image', 'twitter_image', 'canonical_url']);

export default class TagContext extends MigrateBase {
    // eslint-disable-next-line no-unused-private-class-members -- assigned but not yet read
    #context;
    protected override get urlFields() {
        return TAG_URL_FIELDS;
    }

    data: any = {};

    constructor(args?: any) {
        super();

        this.#context = this.constructor.name;

        let initialData = {};

        // If object supplied does not contain `initialData` or `schema`, use as initialData
        if (typeof args === 'object' && !args.initialData && !args.schema) {
            initialData = args;
        } else {
            initialData = args?.initialData ?? {};
        }

        this.schema = tagZodSchema;
        this.initializeData();

        // Set initial data if provided
        Object.entries(initialData).forEach((item: any) => {
            const [key, value] = item;
            this.data[key] = value;
        });
    }

    protected override applySanitizers() {
        // Ghost rejects a tag name starting with a comma (matches: /^([^,]|$)/).
        // Strip them before the shared pass so the length check sees the final value.
        if (typeof this.data.name === 'string') {
            this.data.name = this.data.name.replace(/^[\s,]+/, '');
        }

        super.applySanitizers();
    }

    save(db: DatabaseModels) {
        // Sanitize before the cache lookup below — the slug is the cache key
        const sanitizedStart = db.sanitizedFields.length;
        this.sanitize(db.sanitizedFields);
        const sanitized = db.sanitizedFields.slice(sanitizedStart);

        // Check slug cache first — avoids DB round-trip for already-known tags
        if (!this.dbId && this.data.slug && db.tagCache.has(this.data.slug)) {
            const cached = db.tagCache.get(this.data.slug)!;
            this.dbId = cached.dbId;
            this.ghostId = cached.ghostId;
            recordSanitizedFields(db, sanitized);
            return;
        }

        const tagData = JSON.stringify(this.data);

        if (!this.ghostId) {
            this.ghostId = randomBytes(12).toString('hex');
        }

        if (this.dbId) {
            db.stmts.updateTagById.run(tagData, this.data.slug, this.data.name, this.ghostId, this.dbId);
        } else {
            const existing = this.data.slug ? (db.stmts.findTagBySlug.get(this.data.slug) as any) : null;

            if (existing) {
                this.dbId = existing.id as number;
                this.ghostId = (existing.ghost_id as string) || this.ghostId;
                db.stmts.updateTagById.run(tagData, this.data.slug, this.data.name, this.ghostId, this.dbId);
            } else {
                const result = db.stmts.insertTag.run(tagData, this.data.slug, this.data.name, this.ghostId);
                this.dbId = Number(result.lastInsertRowid);
            }
        }

        // Populate cache after successful save
        if (this.data.slug && this.dbId && this.ghostId) {
            db.tagCache.set(this.data.slug, {dbId: this.dbId, ghostId: this.ghostId});
        }

        recordSanitizedFields(db, sanitized);
    }

    static fromRow(row: any): TagContext {
        const data = JSON.parse(row.data);
        const tag = new TagContext(data);
        tag.dbId = row.id as number;
        tag.ghostId = row.ghost_id as string;
        return tag;
    }
}
