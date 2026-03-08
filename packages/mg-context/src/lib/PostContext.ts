import {z} from 'zod/v4';
import mobiledocConverter from '@tryghost/html-to-mobiledoc';
import lexicalConverter from '@tryghost/kg-html-to-lexical';
import MigrateBase from './MigrateBase.js';
import TagContext, {TagObject, TagDataObject} from './TagContext.js';
import AuthorContext, {AuthorObject, AuthorDataObject} from './AuthorContext.js';

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
};

export default class PostContext extends MigrateBase {
    #source: any;
    #meta: any;
    #contentFormat: 'mobiledoc' | 'lexical' | 'html';
    data: any = {};

    constructor({source = {}, meta = {}, contentFormat = 'html'}: PostConstructorOptions = {}) {
        super();

        // Source data from another platform
        this.#source = source;

        this.#meta = meta;

        this.#contentFormat = contentFormat;

        this.schema = postZodSchema;
        this.initializeData();
    }

    get meta() {
        return this.#meta;
    }

    set(prop: string, value: any) {
        if (prop === 'html') {
            if (this.#contentFormat === 'mobiledoc') {
                super.set('mobiledoc', mobiledocConverter.toMobiledoc(value));
            } else if (this.#contentFormat === 'lexical') {
                super.set('lexical', lexicalConverter.htmlToLexical(value));
            }
        }

        super.set(prop, value);

        return this;
    }

    get getFinal(): any {
        const result = super.getFinal;

        if (this.#contentFormat === 'lexical') {
            result.data.html = null;
            result.data.mobiledoc = null;
        } else if (this.#contentFormat === 'mobiledoc') {
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
}
