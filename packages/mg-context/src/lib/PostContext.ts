import {z} from 'zod/v4';
import {randomBytes} from 'node:crypto';
import mobiledocConverter from '@tryghost/html-to-mobiledoc';
import lexicalConverter from '@tryghost/kg-html-to-lexical';
import MigrateBase from './MigrateBase.js';
import TagContext, {TagObject, TagDataObject} from './TagContext.js';
import AuthorContext, {AuthorObject, AuthorDataObject} from './AuthorContext.js';
import type {DatabaseModels} from './database.js';

export const postZodSchema = z.object({
    title: z.string().max(255),
    slug: z.string().max(191),
    html: z.string().max(1000000000).nullable(),
    mobiledoc: z.string().max(1000000000).nullable(),
    lexical: z.string().max(1000000000).nullable(),
    comment_id: z.string().max(50).nullable(),
    plaintext: z.string().max(1000000000).nullable(),
    feature_image: z.string().max(2000).nullable(),
    feature_image_alt: z.string().max(125).nullable(),
    feature_image_caption: z.string().max(65535).nullable(),
    featured: z.boolean().default(false),
    type: z.enum(['post', 'page']).default('post'),
    status: z.enum(['published', 'draft', 'scheduled', 'sent']).default('draft'),
    visibility: z.enum(['public', 'members', 'paid']).default('public'),
    created_at: z.date(),
    updated_at: z.date().nullable(),
    published_at: z.date().nullable(),
    custom_excerpt: z.string().max(300).nullable(),
    codeinjection_head: z.string().max(65535).nullable(),
    codeinjection_foot: z.string().max(65535).nullable(),
    custom_template: z.string().max(100).nullable(),
    canonical_url: z.string().max(2000).nullable(),
    og_image: z.string().max(2000).nullable(),
    og_title: z.string().max(300).nullable(),
    og_description: z.string().max(500).nullable(),
    twitter_image: z.string().max(2000).nullable(),
    twitter_title: z.string().max(300).nullable(),
    twitter_description: z.string().max(500).nullable(),
    meta_title: z.string().max(300).nullable(),
    meta_description: z.string().max(500).nullable(),
    tags: z.array(z.any()).max(500).default([]),
    authors: z.array(z.any()).max(500).default([])
});

export type PostObject = z.infer<typeof postZodSchema>;

export type PostDataObject = {
    data: PostObject;
};

export type PostConstructorOptions = {
    source?: Object;
    meta?: Object;
    contentFormat?: 'mobiledoc' | 'lexical' | 'html';
    lookupKey?: string;
};

export default class PostContext extends MigrateBase {
    #source: any;
    #meta: any;
    #contentFormat: 'mobiledoc' | 'lexical' | 'html';
    #lookupKey: string | null = null;
    #warnOnLookupKeyDuplicate = false;
    #duplicateSkipped = false;
    #htmlDirty = true;
    data: any = {};

    constructor({source = {}, meta = {}, contentFormat = 'lexical', lookupKey}: PostConstructorOptions = {}) {
        super();

        // Source data from another platform
        this.#source = source;

        this.#meta = meta;

        this.#contentFormat = contentFormat;

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

    get warnOnLookupKeyDuplicate(): boolean {
        return this.#warnOnLookupKeyDuplicate;
    }

    set warnOnLookupKeyDuplicate(value: boolean) {
        this.#warnOnLookupKeyDuplicate = value;
    }

    get meta() {
        return this.#meta;
    }

    get htmlDirty(): boolean {
        return this.#htmlDirty;
    }

    set(prop: string, value: any) {
        super.set(prop, value);
        if (prop === 'html') {
            this.#htmlDirty = true;
            // Invalidate cached conversion
            this.data.lexical = null;
            this.data.mobiledoc = null;
        }
        return this;
    }

    convertContent() {
        if (!this.#htmlDirty || this.#contentFormat === 'html') {
            this.#htmlDirty = false;
            return;
        }

        if (this.#contentFormat === 'lexical') {
            this.data.lexical = this.data.html
                ? JSON.stringify(lexicalConverter.htmlToLexical(this.data.html))
                : null;
            this.data.mobiledoc = null;
        } else if (this.#contentFormat === 'mobiledoc') {
            this.data.mobiledoc = this.data.html
                ? JSON.stringify(mobiledocConverter.toMobiledoc(this.data.html))
                : null;
            this.data.lexical = null;
        }

        this.#htmlDirty = false;
    }

    get getFinal(): any {
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

        if (this.#contentFormat === 'lexical') {
            if (!result.data.lexical && result.data.html) {
                result.data.lexical = JSON.stringify(lexicalConverter.htmlToLexical(result.data.html));
            }
            result.data.html = null;
            result.data.mobiledoc = null;
        } else if (this.#contentFormat === 'mobiledoc') {
            if (!result.data.mobiledoc && result.data.html) {
                result.data.mobiledoc = JSON.stringify(mobiledocConverter.toMobiledoc(result.data.html));
            }
            result.data.html = null;
            result.data.lexical = null;
        } else {
            result.data.mobiledoc = null;
            result.data.lexical = null;
        }

        return result;
    }

    setMeta(value: any) {
        this.#meta = value;
    }

    getMetaValue(key: any) {
        return this.#meta[key];
    }

    get source() {
        return this.#source;
    }

    getSourceValue(key: string) {
        return this.#source[key];
    }

    hasTagSlug(tagSlug: string) {
        return this.data.tags.some((tag: TagDataObject) => tag.data.slug === tagSlug);
    }

    hasTagName(tagName: string) {
        return this.data.tags.some((tag: TagDataObject) => tag.data.name === tagName);
    }

    addTag(value: TagContext | TagObject) {
        // Exit early if the tag already exists
        if (value instanceof TagContext) {
            if (value && this.hasTagSlug(value.data.slug)) {
                return false;
            }
        } else {
            if (value && this.hasTagSlug(value.slug)) {
                return false;
            }
        }

        if (value instanceof TagContext) {
            this.data.tags.push(value);
        } else {
            const newTag = new TagContext({initialData: value});
            this.data.tags.push(newTag);
            return newTag;
        }
    }

    removeTag(tagSlug: string) {
        this.data.tags = this.data.tags.filter((tag: TagDataObject) => {
            return tag.data.slug !== tagSlug;
        });
    }

    setTagOrder(callback: Function) {
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

    addAuthor(value: AuthorContext | AuthorObject) {
        // Exit early if the tag already exists
        if (value instanceof AuthorContext) {
            if (value && this.hasAuthorSlug(value.data.slug)) {
                return false;
            }
        } else {
            if (value && this.hasAuthorSlug(value.slug)) {
                return false;
            }
        }

        if (value instanceof AuthorContext) {
            this.data.authors.push(value);
        } else {
            const newAuthor = new AuthorContext({initialData: value});
            this.data.authors.push(newAuthor);
            return newAuthor;
        }
    }

    removeAuthor(authorSlug: string) {
        this.data.authors = this.data.authors.filter((author: AuthorDataObject) => author.data.slug !== authorSlug);
    }

    setAuthorOrder(callback: Function) {
        this.data.authors = callback(this.data.authors);
    }

    setPrimaryAuthor(value: AuthorObject) {
        const hasAuthor = this.hasAuthorSlug(value.slug);

        if (!hasAuthor) {
            this.addAuthor(value);
        }

        this.setAuthorOrder((authors: AuthorObject[]) => {
            const targetAuthorIndex = authors.findIndex((el: AuthorObject) => el.name === value.slug);
            const targetAuthor = authors.splice(targetAuthorIndex, 1)[0];

            authors.splice(0, 0, targetAuthor);

            return authors;
        });
    }

    save(db: DatabaseModels) {
        if (this.#duplicateSkipped) {
            return;
        }

        const isInsert = !this.dbId;

        // Serialize post data excluding tags and authors
        const postData: any = {};
        for (const key of Object.keys(this.data)) {
            if (key !== 'tags' && key !== 'authors') {
                postData[key] = this.data[key];
            }
        }

        const serializedData = JSON.stringify(postData);
        const serializedSource = JSON.stringify(this.#source);
        const serializedMeta = JSON.stringify(this.#meta);
        /* c8 ignore next 3 -- dates are always Date instances from set()/fromRow(); ternary is defensive */
        const createdAt = this.data.created_at instanceof Date ? this.data.created_at.toISOString() : this.data.created_at;
        const updatedAt = this.data.updated_at instanceof Date ? this.data.updated_at.toISOString() : this.data.updated_at;
        const publishedAt = this.data.published_at instanceof Date ? this.data.published_at.toISOString() : this.data.published_at;

        if (!this.ghostId) {
            this.ghostId = randomBytes(12).toString('hex');
        }

        if (this.dbId) {
            db.stmts.updatePost.run(
                serializedData, serializedSource, serializedMeta,
                this.#contentFormat, this.#lookupKey, this.ghostId,
                createdAt, updatedAt, publishedAt,
                this.dbId
            );
        } else {
            // Check for existing post by lookup_key
            if (this.#lookupKey) {
                const existing = db.stmts.findPostByLookupKey.get(this.#lookupKey) as any;
                if (existing) {
                    this.dbId = existing.id as number;
                    this.ghostId = existing.ghost_id as string;
                    this.#duplicateSkipped = true;
                    if (this.#warnOnLookupKeyDuplicate) {
                        // eslint-disable-next-line no-console
                        console.warn(`Duplicate post skipped for lookup_key: ${this.#lookupKey}`);
                    }
                    return;
                }
            }

            const result = db.stmts.insertPost.run(
                serializedData, serializedSource, serializedMeta,
                this.#contentFormat, this.#lookupKey, this.ghostId,
                createdAt, updatedAt, publishedAt
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
                db.stmts.insertPostTag.run(this.dbId, tag.dbId, i);
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
                db.stmts.insertPostAuthor.run(this.dbId, author.dbId, i);
            }
        }
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

    static toGhostPost(row: any): {post: any; meta: any; didConvert: boolean} {
        const rawData = JSON.parse(row.data);
        const contentFormat = row.content_format;
        const ghostId = row.ghost_id as string;
        let didConvert = false;

        // Use pre-converted content if available, otherwise convert
        if (contentFormat === 'lexical') {
            if (!rawData.lexical && rawData.html) {
                rawData.lexical = JSON.stringify(lexicalConverter.htmlToLexical(rawData.html));
                didConvert = true;
            }
            rawData.html = null;
            rawData.mobiledoc = null;
        } else if (contentFormat === 'mobiledoc') {
            if (!rawData.mobiledoc && rawData.html) {
                rawData.mobiledoc = JSON.stringify(mobiledocConverter.toMobiledoc(rawData.html));
                didConvert = true;
            }
            rawData.html = null;
            rawData.lexical = null;
        } else {
            rawData.mobiledoc = null;
            rawData.lexical = null;
        }

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

        return {post, meta, didConvert};
    }

    static fromRow(row: any, db: DatabaseModels): PostContext {
        const rawData = JSON.parse(row.data);
        const source = JSON.parse(row.source);
        const meta = JSON.parse(row.meta);
        const contentFormat = row.content_format;

        // Convert date strings back to Date objects
        const dateFields = ['created_at', 'updated_at', 'published_at'];
        for (const field of dateFields) {
            if (rawData[field] && typeof rawData[field] === 'string') {
                rawData[field] = new Date(rawData[field]);
            }
        }

        const lookupKey = row.lookup_key as string | null;
        const post = new PostContext({source, meta, contentFormat, lookupKey: lookupKey ?? undefined});
        post.dbId = row.id as number;
        post.ghostId = row.ghost_id as string;

        // Set scalar data directly (bypass set() to avoid re-conversion)
        for (const [key, value] of Object.entries(rawData)) {
            if (key !== 'tags' && key !== 'authors') {
                post.data[key] = value;
            }
        }

        // Post was loaded from DB; nothing has been modified yet
        post.#htmlDirty = false;

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
