import {z} from 'zod/v4';
import {randomBytes} from 'node:crypto';
import MigrateBase from './MigrateBase.js';
import type {DatabaseModels} from './database.js';

export const tagZodSchema = z.object({
    name: z.string().max(255),
    slug: z.string().max(191),
    description: z.string().max(500).nullable(),
    feature_image: z.string().max(2000).nullable(),
    og_image: z.string().max(2000).nullable(),
    og_title: z.string().max(300).nullable(),
    og_description: z.string().max(500).nullable(),
    twitter_image: z.string().max(2000).nullable(),
    twitter_title: z.string().max(300).nullable(),
    twitter_description: z.string().max(500).nullable(),
    meta_title: z.string().max(300).nullable(),
    meta_description: z.string().max(500).nullable(),
    codeinjection_head: z.string().max(65535).nullable(),
    codeinjection_foot: z.string().max(65535).nullable(),
    canonical_url: z.string().max(2000).nullable()
});

export type TagObject = z.infer<typeof tagZodSchema>;

export type TagDataObject = {
    data: TagObject;
};

export default class TagContext extends MigrateBase {
    #context;
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

    save(db: DatabaseModels) {
        // Check slug cache first — avoids DB round-trip for already-known tags
        if (!this.dbId && this.data.slug && db.tagCache.has(this.data.slug)) {
            const cached = db.tagCache.get(this.data.slug)!;
            this.dbId = cached.dbId;
            this.ghostId = cached.ghostId;
            return;
        }

        const tagData = JSON.stringify(this.data);

        if (!this.ghostId) {
            this.ghostId = randomBytes(12).toString('hex');
        }

        if (this.dbId) {
            db.stmts.updateTagById.run(tagData, this.data.slug, this.data.name, this.ghostId, this.dbId);
        } else {
            const existing = this.data.slug ? db.stmts.findTagBySlug.get(this.data.slug) as any : null;

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
    }

    static fromRow(row: any): TagContext {
        const data = JSON.parse(row.data);
        const tag = new TagContext(data);
        tag.dbId = row.id as number;
        tag.ghostId = row.ghost_id as string;
        return tag;
    }
}
