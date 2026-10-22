import {z} from 'zod/v4';
import {randomBytes} from 'node:crypto';
import errors from '@tryghost/errors';
import MigrateBase from './MigrateBase.js';
import TagContext, {TagObject, TagDataObject} from './TagContext.js';
import AuthorContext, {AuthorObject, AuthorDataObject} from './AuthorContext.js';
import {GHOST_FIELD_LIMITS} from './ghost-schema.js';
import {
    assertMappedWrite,
    recordMigrationEvent,
    recordSanitizedFields,
    type DatabaseModels,
    type SanitizedField
} from './database.js';
import {withTransaction} from './db-helpers.js';

export type DuplicatePostAction = 'skip' | 'replace';
export type DuplicatePostResolver = (existing: PostContext, incoming: PostContext) => DuplicatePostAction;
export type DuplicatePostPolicy = DuplicatePostAction | DuplicatePostResolver;

const POST_LIMITS = GHOST_FIELD_LIMITS.post;
const MAX_SLUG_LENGTH = POST_LIMITS.slug;

/**
 * Build a deduplicated slug that still fits Ghost's limit, trimming the base
 * to make room for the suffix rather than overflowing past it.
 */
function slugWithSuffix(base: string, suffix: number): string {
    const tail = `-${suffix}`;
    const room = MAX_SLUG_LENGTH - tail.length;
    const trimmedBase = base.length > room ? base.slice(0, room).replace(/-+$/, '') : base;
    return `${trimmedBase}${tail}`;
}

export function normalizeTitle(value: unknown): string {
    const title = typeof value === 'string' ? value.trim() : '';
    return (title || '(Untitled)').slice(0, POST_LIMITS.title);
}

const postZodSchema = z.object({
    title: z.string().max(POST_LIMITS.title),
    slug: z.string().max(MAX_SLUG_LENGTH),
    html: z.string().max(POST_LIMITS.html).nullable(),
    comment_id: z.string().max(POST_LIMITS.comment_id).nullable(),
    plaintext: z.string().max(POST_LIMITS.plaintext).nullable(),
    feature_image: z.string().max(POST_LIMITS.feature_image).nullable(),
    feature_image_alt: z.string().max(POST_LIMITS.feature_image_alt).nullable(),
    feature_image_caption: z.string().max(POST_LIMITS.feature_image_caption).nullable(),
    featured: z.boolean().default(false),
    type: z.enum(['post', 'page']).default('post'),
    status: z.enum(['published', 'draft', 'scheduled', 'sent']).default('draft'),
    visibility: z.enum(['public', 'members', 'paid']).default('public'),
    created_at: z.date(),
    updated_at: z.date().nullable(),
    published_at: z.date().nullable(),
    custom_excerpt: z.string().max(POST_LIMITS.custom_excerpt).nullable(),
    codeinjection_head: z.string().max(POST_LIMITS.codeinjection_head).nullable(),
    codeinjection_foot: z.string().max(POST_LIMITS.codeinjection_foot).nullable(),
    custom_template: z.string().max(POST_LIMITS.custom_template).nullable(),
    canonical_url: z.string().max(POST_LIMITS.canonical_url).nullable(),
    og_image: z.string().max(POST_LIMITS.og_image).nullable(),
    og_title: z.string().max(POST_LIMITS.og_title).nullable(),
    og_description: z.string().max(POST_LIMITS.og_description).nullable(),
    twitter_image: z.string().max(POST_LIMITS.twitter_image).nullable(),
    twitter_title: z.string().max(POST_LIMITS.twitter_title).nullable(),
    twitter_description: z.string().max(POST_LIMITS.twitter_description).nullable(),
    meta_title: z.string().max(POST_LIMITS.meta_title).nullable(),
    meta_description: z.string().max(POST_LIMITS.meta_description).nullable(),
    tags: z.array(z.any()).max(500).default([]),
    authors: z.array(z.any()).max(500).default([])
});

export type PostObject = z.infer<typeof postZodSchema>;
export type PostDataPatch = Partial<Omit<PostObject, 'slug' | 'tags' | 'authors'>>;

export interface PostSnapshot {
    databaseId: number;
    ghostId: string | null;
    lookupKey: string | null;
    data: PostObject;
    webscrapeData: unknown | null;
}

export type PostConstructorOptions = {
    lookupKey?: string;
    onDuplicate?: DuplicatePostPolicy;
};

const POST_URL_FIELDS: ReadonlySet<string> = new Set(['feature_image', 'og_image', 'twitter_image', 'canonical_url']);

function changedSnapshotFields(previous: PostSnapshot, current: PostSnapshot): string[] {
    const fields = new Set([...Object.keys(previous.data), ...Object.keys(current.data)]);
    const changed = [...fields].filter(
        field =>
            JSON.stringify(previous.data[field as keyof PostObject]) !==
            JSON.stringify(current.data[field as keyof PostObject])
    );

    for (const field of ['webscrapeData'] as const) {
        if (JSON.stringify(previous[field]) !== JSON.stringify(current[field])) {
            changed.push(field);
        }
    }

    return changed;
}

export default class PostContext extends MigrateBase {
    protected override get urlFields() {
        return POST_URL_FIELDS;
    }

    protected override sanitizeValue(key: string, value: any): any {
        const sanitized = super.sanitizeValue(key, value);
        return key === 'title' ? normalizeTitle(sanitized) : sanitized;
    }

    protected override applySanitizers() {
        this.data.title = normalizeTitle(this.data.title);
        super.applySanitizers();
    }

    #lookupKey: string | null = null;
    #onDuplicate: DuplicatePostPolicy;
    #warnOnLookupKeyDuplicate = false;
    #duplicateSkipped = false;
    #webscrapeData: any = null;
    data: any = {};

    constructor({lookupKey, onDuplicate = 'skip', ...removed}: PostConstructorOptions = {}) {
        super();
        if (Object.keys(removed).some(key => ['source', 'sourceContent', 'sourceMeta', 'meta'].includes(key))) {
            throw new errors.BadRequestError({
                message: 'Post source and meta options were removed; use context.sources for original input.'
            });
        }
        this.#onDuplicate = onDuplicate;

        if (lookupKey) {
            this.#lookupKey = lookupKey;
        }

        this.schema = postZodSchema;
        this.initializeData();
    }

    get lookupKey(): string | null {
        return this.#lookupKey;
    }

    set lookupKey(value: string | null) {
        this.#lookupKey = value;
    }

    get onDuplicate(): DuplicatePostPolicy {
        return this.#onDuplicate;
    }

    set onDuplicate(value: DuplicatePostPolicy) {
        this.#onDuplicate = value;
        if (value !== 'skip') {
            this.#duplicateSkipped = false;
        }
    }

    /** @deprecated Duplicate skips are available through events and getMigrationReport(). */
    get warnOnLookupKeyDuplicate(): boolean {
        return this.#warnOnLookupKeyDuplicate;
    }

    /** @deprecated Duplicate skips are available through events and getMigrationReport(). */
    set warnOnLookupKeyDuplicate(value: boolean) {
        // Deprecated compatibility shim. Duplicate skips are reported instead of logged.
        this.#warnOnLookupKeyDuplicate = value;
    }

    get webscrapeData(): any {
        return this.#webscrapeData;
    }

    set webscrapeData(value: any) {
        this.#webscrapeData = value;
    }

    get getFinal(): any {
        this.data.title = normalizeTitle(this.data.title);
        const result = super.getFinal;

        // Inject ghost IDs into nested tags and authors
        if (result.data.tags) {
            result.data.tags = result.data.tags.map((tag: any) => {
                if (tag.ghostId) {
                    return {data: {id: tag.ghostId, ...tag.data}};
                }
                return tag;
            });
        }
        if (result.data.authors) {
            result.data.authors = result.data.authors.map((author: any) => {
                if (author.ghostId) {
                    return {data: {id: author.ghostId, ...author.data}};
                }
                return author;
            });
        }

        return result;
    }

    toSnapshot(): PostSnapshot {
        if (!this.dbId) {
            throw new errors.InternalServerError({message: 'Cannot snapshot a post before it is saved.'});
        }

        const data: any = {};
        for (const [key, value] of Object.entries(this.data)) {
            if (key !== 'tags' && key !== 'authors') {
                data[key] = structuredClone(value);
            }
        }
        data.tags = this.data.tags.map((tag: TagContext | TagDataObject) => structuredClone(tag.data));
        data.authors = this.data.authors.map((author: AuthorContext | AuthorDataObject) =>
            structuredClone(author.data)
        );

        return {
            databaseId: this.dbId,
            ghostId: this.ghostId,
            lookupKey: this.#lookupKey,
            data,
            webscrapeData: this.#webscrapeData === null ? null : JSON.parse(JSON.stringify(this.#webscrapeData))
        };
    }

    hasTagSlug(tagSlug: string) {
        return this.data.tags.some((tag: TagDataObject) => tag.data.slug === tagSlug);
    }

    hasTagName(tagName: string) {
        return this.data.tags.some((tag: TagDataObject) => tag.data.name === tagName);
    }

    addTag(value: TagContext | (TagObject & {sortOrder?: number})) {
        let sortOrder: number | undefined;

        // Exit early if the tag already exists
        if (value instanceof TagContext) {
            if (value && this.hasTagSlug(value.data.slug)) {
                return false;
            }
        } else {
            if (value && this.hasTagSlug(value.slug)) {
                return false;
            }
            ({sortOrder, ...value} = value);
        }

        const tag = value instanceof TagContext ? value : new TagContext({initialData: value});

        if (sortOrder !== undefined && sortOrder >= 0 && sortOrder < this.data.tags.length) {
            this.data.tags.splice(sortOrder, 0, tag);
        } else {
            this.data.tags.push(tag);
        }

        return value instanceof TagContext ? undefined : tag;
    }

    removeTag(tagSlug: string) {
        this.data.tags = this.data.tags.filter((tag: TagDataObject) => {
            return tag.data.slug !== tagSlug;
        });
    }

    setTagOrder(callback: {(tags: TagContext[]): TagContext[]}) {
        // eslint-disable-line no-unused-vars
        this.data.tags = callback(this.data.tags);
    }

    setPrimaryTag(value: TagObject) {
        const hasTag = this.hasTagSlug(value.slug);

        if (!hasTag) {
            this.addTag(value);
        }

        // Remove the existing tag from the list (if it exists)
        this.removeTag(value.slug);

        // Create a new tag instance
        let theNewTag = new TagContext({initialData: value});

        // And set the new tags array, with the new primary tag at the front
        this.data.tags = [theNewTag, ...this.data.tags];
    }

    hasAuthorSlug(authorSlug: string) {
        return this.data.authors.some((author: AuthorDataObject) => author.data.slug === authorSlug);
    }

    hasAuthorName(authorName: string) {
        return this.data.authors.some((author: AuthorDataObject) => author.data.name === authorName);
    }

    hasAuthorEmail(authorEmail: string) {
        return this.data.authors.some((author: AuthorDataObject) => author.data.email === authorEmail);
    }

    addAuthor(value: AuthorContext | (AuthorObject & {sortOrder?: number})) {
        let sortOrder: number | undefined;

        // Exit early if the author already exists
        if (value instanceof AuthorContext) {
            if (value && this.hasAuthorSlug(value.data.slug)) {
                return false;
            }
        } else {
            if (value && this.hasAuthorSlug(value.slug)) {
                return false;
            }
            ({sortOrder, ...value} = value);
        }

        const author = value instanceof AuthorContext ? value : new AuthorContext({initialData: value});

        if (sortOrder !== undefined && sortOrder >= 0 && sortOrder < this.data.authors.length) {
            this.data.authors.splice(sortOrder, 0, author);
        } else {
            this.data.authors.push(author);
        }

        return value instanceof AuthorContext ? undefined : author;
    }

    removeAuthor(authorSlug: string) {
        this.data.authors = this.data.authors.filter((author: AuthorDataObject) => author.data.slug !== authorSlug);
    }

    setAuthorOrder(callback: {(authors: AuthorContext[]): AuthorContext[]}) {
        // eslint-disable-line no-unused-vars
        this.data.authors = callback(this.data.authors);
    }

    setPrimaryAuthor(value: AuthorObject) {
        const hasAuthor = this.hasAuthorSlug(value.slug);

        if (!hasAuthor) {
            this.addAuthor(value);
        }

        this.setAuthorOrder((authors: AuthorContext[]) => {
            const targetAuthorIndex = authors.findIndex((el: any) => el.data.slug === value.slug);
            const targetAuthor = authors.splice(targetAuthorIndex, 1)[0];

            authors.splice(0, 0, targetAuthor);

            return authors;
        });
    }

    save(db: DatabaseModels): void {
        assertMappedWrite(db);
        if (this.#duplicateSkipped) {
            return;
        }

        if (!db.inTransaction) {
            withTransaction(db, () => this.save(db));
            return;
        }

        let replacingDuplicate = false;
        let previousSnapshot: PostSnapshot | null = null;

        // Check for an existing post by lookup_key before anything is mutated or
        // recorded, so a post that will never be inserted does not claim a slug
        // or leave a rename behind
        if (!this.dbId && this.#lookupKey) {
            const existing = db.stmts.findPostByLookupKey.get(this.#lookupKey) as any;
            if (existing) {
                const existingPost = PostContext.fromRow(existing, db);
                previousSnapshot = existingPost.toSnapshot();
                const action =
                    typeof this.#onDuplicate === 'function' ? this.#onDuplicate(existingPost, this) : this.#onDuplicate;
                if (action !== 'skip' && action !== 'replace') {
                    throw new errors.InternalServerError({
                        message: 'Duplicate post resolver must return "skip" or "replace".',
                        context: action
                    });
                }

                this.dbId = existing.id as number;
                this.ghostId = existing.ghost_id as string;
                if (action === 'skip') {
                    this.#duplicateSkipped = true;
                    recordMigrationEvent(db, 'post:skipped', {
                        postId: this.dbId,
                        lookupKey: this.#lookupKey,
                        details: {existingPostId: this.dbId},
                        liveEvent: {
                            type: 'post:skipped',
                            payload: {lookupKey: this.#lookupKey, existingPostId: this.dbId}
                        }
                    });
                    return;
                }
                replacingDuplicate = true;
            }
        }

        const sanitized: SanitizedField[] = [];
        this.sanitize(sanitized);

        const isInsert = !this.dbId;

        const serializedWebscrapeData = this.#webscrapeData ? JSON.stringify(this.#webscrapeData) : null;
        /* c8 ignore next 3 -- dates are always Date instances from set()/fromRow(); ternary is defensive */
        const createdAt =
            this.data.created_at instanceof Date ? this.data.created_at.toISOString() : this.data.created_at;
        const updatedAt =
            this.data.updated_at instanceof Date ? this.data.updated_at.toISOString() : this.data.updated_at;
        const publishedAt =
            this.data.published_at instanceof Date ? this.data.published_at.toISOString() : this.data.published_at;

        if (!this.ghostId) {
            this.ghostId = randomBytes(12).toString('hex');
        }

        let slug = this.data.slug;
        const originalSlug = slug;

        const slugExists = (candidate: string) => {
            if (replacingDuplicate) {
                return db.stmts.slugExistsForOtherPost.get(candidate, this.dbId);
            }
            return !this.dbId && db.stmts.slugExists.get(candidate);
        };

        // On insert or lookup-key replacement, deduplicate the slug if another post owns it
        let slugRename: {oldSlug: string; newSlug: string; url: string} | null = null;
        if (slugExists(slug)) {
            const counterKey = `slug:post:${originalSlug}`;
            const counter = db.stmts.getFingerprint.get(counterKey) as {value: string} | undefined;
            let suffix = replacingDuplicate ? 2 : Number(counter?.value ?? 1) + 1;
            let candidate = slugWithSuffix(originalSlug, suffix);
            while (slugExists(candidate)) {
                suffix += 1;
                candidate = slugWithSuffix(originalSlug, suffix);
            }
            db.stmts.setFingerprint.run(counterKey, String(suffix));
            slug = candidate;
            this.data.slug = slug;

            slugRename = {
                oldSlug: originalSlug,
                newSlug: slug,
                url: this.data.canonical_url || ''
            };
        }

        // Serialize post data excluding tags and authors (after slug dedup)
        const postData: any = {};
        for (const key of Object.keys(this.data)) {
            if (key !== 'tags' && key !== 'authors') {
                postData[key] = this.data[key];
            }
        }
        const serializedData = JSON.stringify(postData);

        if (this.dbId) {
            if (replacingDuplicate) {
                db.stmts.replacePost.run(
                    serializedData,
                    this.#lookupKey,
                    this.ghostId,
                    createdAt,
                    updatedAt,
                    publishedAt,
                    originalSlug,
                    slug,
                    serializedWebscrapeData,
                    this.dbId
                );
            } else {
                db.stmts.updatePost.run(
                    serializedData,
                    this.#lookupKey,
                    this.ghostId,
                    createdAt,
                    updatedAt,
                    publishedAt,
                    slug,
                    serializedWebscrapeData,
                    this.dbId
                );
            }
        } else {
            const result = db.stmts.insertPost.run(
                serializedData,
                this.#lookupKey,
                this.ghostId,
                createdAt,
                updatedAt,
                publishedAt,
                originalSlug,
                slug,
                serializedWebscrapeData
            );
            this.dbId = Number(result.lastInsertRowid);
        }

        // Handle tags - only delete existing join rows on update
        if (!isInsert) {
            db.stmts.deletePostTagsByPostId.run(this.dbId);
        }
        for (let i = 0; i < this.data.tags.length; i++) {
            const tag = this.data.tags[i];
            if (tag instanceof TagContext) {
                tag.save(db);
                db.stmts.insertPostTag.run(this.dbId, tag.dbId, i + 1);
            }
        }

        // Handle authors - only delete existing join rows on update
        if (!isInsert) {
            db.stmts.deletePostAuthorsByPostId.run(this.dbId);
        }
        for (let i = 0; i < this.data.authors.length; i++) {
            const author = this.data.authors[i];
            if (author instanceof AuthorContext) {
                author.save(db);
                db.stmts.insertPostAuthor.run(this.dbId, author.dbId, i + 1);
            }
        }

        const currentSnapshot = this.toSnapshot();
        if (replacingDuplicate && previousSnapshot) {
            recordMigrationEvent(db, 'post:replaced', {
                postId: this.dbId,
                lookupKey: this.#lookupKey,
                details: {changedFields: changedSnapshotFields(previousSnapshot, currentSnapshot)},
                liveEvent: {
                    type: 'post:replaced',
                    payload: {
                        lookupKey: this.#lookupKey,
                        postId: this.dbId,
                        previous: previousSnapshot,
                        current: currentSnapshot
                    }
                }
            });
        } else if (isInsert) {
            recordMigrationEvent(db, 'post:inserted', {
                postId: this.dbId,
                lookupKey: this.#lookupKey,
                details: {slug: this.data.slug, title: this.data.title}
            });
        }

        if (slugRename) {
            const payload = {
                postId: this.dbId,
                lookupKey: this.#lookupKey,
                ...slugRename
            };
            recordMigrationEvent(db, 'slug:renamed', {
                postId: this.dbId,
                lookupKey: this.#lookupKey,
                details: payload,
                liveEvent: {type: 'slug:renamed', payload}
            });
        }

        recordSanitizedFields(db, sanitized);
    }

    static readonly META_FIELDS = [
        'og_image',
        'og_title',
        'og_description',
        'twitter_image',
        'twitter_title',
        'twitter_description',
        'meta_title',
        'meta_description',
        'feature_image_alt',
        'feature_image_caption'
    ];

    static toGhostPost(row: any): {post: any; meta: any} {
        const rawData = JSON.parse(row.data);
        const ghostId = row.ghost_id as string;
        rawData.title = normalizeTitle(rawData.title);

        // Extract meta fields into posts_meta entry
        const metaEntry: any = {};
        let hasMeta = false;
        for (const field of PostContext.META_FIELDS) {
            if (rawData[field] !== null && rawData[field] !== undefined) {
                metaEntry[field] = rawData[field];
                hasMeta = true;
            }
            delete rawData[field];
        }

        // Remove nested tags/authors — junction tables handle these
        delete rawData.tags;
        delete rawData.authors;

        // Build the flat post object with ghost ID
        const post = ghostId ? {id: ghostId, ...rawData} : rawData;

        // Build meta with post_id reference
        const meta = hasMeta ? {post_id: ghostId, ...metaEntry} : null;

        return {post, meta};
    }

    static fromRow(
        row: any,
        db: DatabaseModels,
        {hydrateRelationships = true}: {hydrateRelationships?: boolean} = {}
    ): PostContext {
        const rawData = JSON.parse(row.data);

        // Convert date strings back to Date objects
        const dateFields = ['created_at', 'updated_at', 'published_at'];
        for (const field of dateFields) {
            if (rawData[field] && typeof rawData[field] === 'string') {
                rawData[field] = new Date(rawData[field]);
            }
        }

        const lookupKey = row.lookup_key as string | null;
        const post = new PostContext({
            lookupKey: lookupKey ?? undefined
        });
        post.dbId = row.id as number;
        post.ghostId = row.ghost_id as string;

        // Set scalar data directly; junction tables provide relationships.
        for (const [key, value] of Object.entries(rawData)) {
            if (key !== 'tags' && key !== 'authors') {
                post.data[key] = value;
            }
        }

        if (row.webscrape_data) {
            post.#webscrapeData = JSON.parse(row.webscrape_data);
        }

        if (!hydrateRelationships) {
            return post;
        }

        // Load tags via join table
        const postTags = db.stmts.findPostTagsByPostId.all(post.dbId) as any[];

        for (const pt of postTags) {
            const tagRow = db.stmts.findTagById.get(pt.tag_id) as any;
            if (tagRow) {
                post.data.tags.push(TagContext.fromRow(tagRow));
            }
        }

        // Load authors via join table
        const postAuthors = db.stmts.findPostAuthorsByPostId.all(post.dbId) as any[];

        for (const pa of postAuthors) {
            const authorRow = db.stmts.findAuthorById.get(pa.author_id) as any;
            if (authorRow) {
                post.data.authors.push(AuthorContext.fromRow(authorRow));
            }
        }

        return post;
    }
}
