import {z} from 'zod/v4';
import {randomBytes} from 'node:crypto';
import ghValidate from '@tryghost/validator';
import {slugify} from '@tryghost/string';
import MigrateBase from './MigrateBase.js';
import {GHOST_FIELD_LIMITS} from './ghost-schema.js';
import {assertMappedWrite, recordSanitizedFields, type DatabaseModels, type SanitizedField} from './database.js';

const PLACEHOLDER_EMAIL_DOMAIN = 'example.com';
const AUTHOR_LIMITS = GHOST_FIELD_LIMITS.author;

// Ghost's email validation rejects a local part longer than this
const MAX_EMAIL_LOCAL_LENGTH = 50;

const authorZodSchema = z.object({
    name: z.string().max(AUTHOR_LIMITS.name),
    slug: z.string().max(AUTHOR_LIMITS.slug),
    email: z.string().max(AUTHOR_LIMITS.email),
    profile_image: z.string().max(AUTHOR_LIMITS.profile_image).nullable(),
    cover_image: z.string().max(AUTHOR_LIMITS.cover_image).nullable(),
    bio: z.string().max(AUTHOR_LIMITS.bio).nullable(),
    website: z.string().max(AUTHOR_LIMITS.website).nullable(),
    location: z.string().max(AUTHOR_LIMITS.location).nullable(),
    facebook: z.string().max(AUTHOR_LIMITS.facebook).nullable(),
    twitter: z.string().max(AUTHOR_LIMITS.twitter).nullable(),
    meta_title: z.string().max(AUTHOR_LIMITS.meta_title).nullable(),
    meta_description: z.string().max(AUTHOR_LIMITS.meta_description).nullable(),
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
        assertMappedWrite(db);
        // Sanitize before looking up the canonical stored slug
        const sanitized: SanitizedField[] = [];
        this.sanitize(sanitized);

        // Reuse the canonical stored row through its indexed slug.
        if (!this.dbId && this.data.slug) {
            const existing = db.stmts.findAuthorBySlug.get(this.data.slug) as any;
            if (existing) {
                this.dbId = existing.id;
                this.ghostId = existing.ghost_id;
                this.data = JSON.parse(existing.data);
                recordSanitizedFields(db, sanitized);
                return;
            }
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
            const result = db.stmts.insertAuthor.run(
                authorData,
                this.data.slug,
                this.data.name,
                this.data.email,
                this.ghostId
            );
            this.dbId = Number(result.lastInsertRowid);
        }

        recordSanitizedFields(db, sanitized);
    }

    static fromRow(row: any): AuthorContext {
        const data = JSON.parse(row.data);
        const author = new AuthorContext(data);
        author.dbId = row.id as number;
        author.ghostId = row.ghost_id as string;
        return author;
    }
}
