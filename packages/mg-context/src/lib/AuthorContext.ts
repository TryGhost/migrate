import {z} from 'zod/v4';
import {randomBytes} from 'node:crypto';
import ghValidate from '@tryghost/validator';
import MigrateBase from './MigrateBase.js';
import type {DatabaseModels} from './database.js';

export const authorZodSchema = z.object({
    name: z.string().max(191),
    slug: z.string().max(191),
    email: z.string().max(191).refine(val => ghValidate.isEmail(val), {message: 'Invalid email address'}),
    profile_image: z.string().max(2000).nullable(),
    cover_image: z.string().max(2000).nullable(),
    bio: z.string().max(250).nullable(),
    website: z.string().max(2000).nullable(),
    location: z.string().max(150).nullable(),
    facebook: z.string().max(2000).nullable(),
    twitter: z.string().max(2000).nullable(),
    meta_title: z.string().max(300).nullable(),
    meta_description: z.string().max(500).nullable(),
    role: z.enum(['Contributor', 'Author', 'Editor', 'Administrator']).default('Contributor')
});

export type AuthorObject = z.infer<typeof authorZodSchema>;

export type AuthorDataObject = {
    data: AuthorObject;
};

export default class AuthorContext extends MigrateBase {
    data: any = {};

    constructor(args?: any) {
        super();

        let initialData = {};

        // If object supplied does not contain `initialData` or `schema`, use as initialData
        if (typeof args === 'object' && !args.initialData && !args.schema) {
            initialData = args;
        } else {
            initialData = args?.initialData ?? {};
        }

        this.schema = authorZodSchema;
        this.initializeData();

        // Set initial data if provided
        Object.entries(initialData).forEach(([key, value]) => {
            this.data[key] = value;
        });
    }

    save(db: DatabaseModels) {
        // Check slug cache first — avoids DB round-trip for already-known authors
        if (!this.dbId && this.data.slug && db.authorCache.has(this.data.slug)) {
            const cached = db.authorCache.get(this.data.slug)!;
            this.dbId = cached.dbId;
            this.ghostId = cached.ghostId;
            return;
        }

        const authorData = JSON.stringify(this.data);

        if (!this.ghostId) {
            this.ghostId = randomBytes(12).toString('hex');
        }

        if (this.dbId) {
            db.stmts.updateAuthorById.run(authorData, this.data.slug, this.data.name, this.data.email, this.ghostId, this.dbId);
        } else {
            const existing = this.data.slug ? db.stmts.findAuthorBySlug.get(this.data.slug) as any : null;

            if (existing) {
                this.dbId = existing.id as number;
                this.ghostId = (existing.ghost_id as string) || this.ghostId;
                db.stmts.updateAuthorById.run(authorData, this.data.slug, this.data.name, this.data.email, this.ghostId, this.dbId);
            } else {
                const result = db.stmts.insertAuthor.run(authorData, this.data.slug, this.data.name, this.data.email, this.ghostId);
                this.dbId = Number(result.lastInsertRowid);
            }
        }

        // Populate cache after successful save
        if (this.data.slug && this.dbId && this.ghostId) {
            db.authorCache.set(this.data.slug, {dbId: this.dbId, ghostId: this.ghostId});
        }
    }

    static fromRow(row: any): AuthorContext {
        const data = JSON.parse(row.data);
        const author = new AuthorContext(data);
        author.dbId = row.id as number;
        author.ghostId = row.ghost_id as string;
        return author;
    }
}
