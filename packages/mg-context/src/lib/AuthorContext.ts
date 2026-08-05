import {z} from 'zod/v4';
import {randomBytes} from 'node:crypto';
import ghValidate from '@tryghost/validator';
import {slugify} from '@tryghost/string';
import MigrateBase from './MigrateBase.js';
import type {DatabaseModels} from './database.js';

const PLACEHOLDER_EMAIL_DOMAIN = 'example.com';

// Ghost's email validation rejects a local part longer than this
const MAX_EMAIL_LOCAL_LENGTH = 50;

const authorZodSchema = z.object({
    name: z.string().max(191),
    slug: z.string().max(191),
    email: z.string().max(191),
    profile_image: z.string().max(2000).nullable(),
    cover_image: z.string().max(2000).nullable(),
    bio: z.string().max(250).nullable(),
    website: z.string().max(2000).nullable(),
    location: z.string().max(150).nullable(),
    facebook: z.string().max(2000).nullable(),
    twitter: z.string().max(2000).nullable(),
    meta_title: z.string().max(300).nullable(),
    meta_description: z.string().max(500).nullable(),
    // Ghost's import format expects an array of role names, not a single role
    roles: z.array(z.enum(['Contributor', 'Author', 'Editor', 'Administrator'])).default(['Contributor'])
});

export type AuthorObject = z.infer<typeof authorZodSchema>;

export type AuthorDataObject = {
    data: AuthorObject;
};

const AUTHOR_URL_FIELDS: ReadonlySet<string> = new Set(['website', 'profile_image', 'cover_image']);

export default class AuthorContext extends MigrateBase {
    protected override get urlFields() {
        return AUTHOR_URL_FIELDS;
    }

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

    /**
     * Build a valid stand-in address for an email Ghost would reject. The local part is
     * derived from the address itself so it stays recognisable and distinct — dropping the
     * bogus tail after the last dot, so "hello@world.com123" becomes "hello-world". Falls
     * back to the author's slug, then name, when there is nothing usable to slugify.
     */
    #placeholderEmail(value: string): string {
        const withoutTld = value.includes('.') ? value.slice(0, value.lastIndexOf('.')) : value;

        let local = '';
        for (const candidate of [withoutTld, this.data.slug, this.data.name]) {
            if (typeof candidate === 'string') {
                local = slugify(candidate).slice(0, MAX_EMAIL_LOCAL_LENGTH).replace(/-+$/, '');
                if (local) {
                    break;
                }
            }
        }

        return `${local || 'author'}@${PLACEHOLDER_EMAIL_DOMAIN}`;
    }

    protected override applySanitizers() {
        super.applySanitizers();

        // Ghost requires a valid address on every user, and an invalid one cannot be
        // trimmed into shape — replace it with a derived placeholder instead
        if (typeof this.data.email === 'string' && !ghValidate.isEmail(this.data.email)) {
            this.data.email = this.#placeholderEmail(this.data.email);
        }

        // Ghost validates website as isEmptyOrURL, so anything that is not a URL is
        // dropped. An over-long one has already been dropped by the shared pass, which
        // treats every URL field that way.
        if (typeof this.data.website === 'string' && !ghValidate.isEmptyOrURL(this.data.website)) {
            this.data.website = null;
        }
    }

    save(db: DatabaseModels) {
        // Sanitize before the cache lookup below — the slug is the cache key
        this.sanitize(db.sanitizedFields);

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
            db.stmts.updateAuthorById.run(
                authorData,
                this.data.slug,
                this.data.name,
                this.data.email,
                this.ghostId,
                this.dbId
            );
        } else {
            const existing = this.data.slug ? (db.stmts.findAuthorBySlug.get(this.data.slug) as any) : null;

            if (existing) {
                this.dbId = existing.id as number;
                this.ghostId = (existing.ghost_id as string) || this.ghostId;
                db.stmts.updateAuthorById.run(
                    authorData,
                    this.data.slug,
                    this.data.name,
                    this.data.email,
                    this.ghostId,
                    this.dbId
                );
            } else {
                const result = db.stmts.insertAuthor.run(
                    authorData,
                    this.data.slug,
                    this.data.name,
                    this.data.email,
                    this.ghostId
                );
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
