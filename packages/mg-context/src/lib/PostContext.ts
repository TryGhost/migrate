import MigrateBase from './MigrateBase.js';
import TagContext, {TagObject, TagDataObject} from './TagContext.js';
import AuthorContext, {AuthorObject, AuthorDataObject} from './AuthorContext.js';

export type PostObject = {
    title: string;
    slug: string;
    html?: string;
    comment_id?: string;
    plaintext?: string;
    feature_image?: string;
    feature_image_alt?: string;
    feature_image_caption?: string;
    featured: string;
    type: 'post' | 'page';
    status: 'published' | 'draft' | 'scheduled' | 'sent';
    visibility: 'public' | 'members' | 'paid';
    created_at: string;
    updated_at?: string;
    published_at?: string;
    custom_excerpt?: string;
    codeinjection_head?: string;
    codeinjection_foot?: string;
    custom_template?: string;
    canonical_url?: string;
    og_image?: string;
    og_title?: string;
    og_description?: string;
    twitter_image?: string;
    twitter_title?: string;
    twitter_description?: string;
    meta_title?: string;
    meta_description?: string;
    tags?: TagObject[];
    authors?: AuthorObject[];
};

export type PostDataObject = {
    data: PostObject;
};

export type PostConstructorOptions = {
    source?: Object;
    meta?: Object;
};

export default class PostContext extends MigrateBase {
    #source: any;
    #schema;
    #meta: any;
    data: any = {};

    constructor({source = {}, meta = {}}: PostConstructorOptions = {}) {
        super();

        // Source data from another platform
        this.#source = source;

        this.#meta = meta;

        // Define what fields are allowed, their types, validations, and defaults
        this.#schema = {
            title: {required: true, type: 'string', maxLength: 255},
            slug: {required: true, type: 'string', maxLength: 191},
            html: {type: 'string', maxLength: 1000000000},
            comment_id: {type: 'string', maxLength: 50},
            plaintext: {type: 'string', maxLength: 1000000000},
            feature_image: {type: 'string', maxLength: 2000},
            feature_image_alt: {type: 'string', maxLength: 125},
            feature_image_caption: {type: 'string', maxLength: 65535},
            featured: {required: true, type: 'boolean', default: false},
            type: {required: true, type: 'string', maxLength: 50, choices: ['post', 'page'], default: 'post'},
            status: {required: true, type: 'string', maxLength: 50, choices: ['published', 'draft', 'scheduled', 'sent'], default: 'draft'},
            visibility: {required: true, type: 'string', maxLength: 50, choices: ['public', 'members', 'paid'], default: 'public'},
            created_at: {required: true, type: 'dateTime'},
            updated_at: {type: 'dateTime'},
            published_at: {type: 'dateTime'},
            custom_excerpt: {type: 'string', maxLength: 300},
            codeinjection_head: {type: 'string', maxLength: 65535},
            codeinjection_foot: {type: 'string', maxLength: 65535},
            custom_template: {type: 'string', maxLength: 100},
            canonical_url: {type: 'string', maxLength: 2000},
            og_image: {type: 'string', maxLength: 2000},
            og_title: {type: 'string', maxLength: 300},
            og_description: {type: 'string', maxLength: 500},
            twitter_image: {type: 'string', maxLength: 2000},
            twitter_title: {type: 'string', maxLength: 300},
            twitter_description: {type: 'string', maxLength: 500},
            meta_title: {type: 'string', maxLength: 300},
            meta_description: {type: 'string', maxLength: 500},
            tags: {type: 'array', maxLength: 500, default: []},
            authors: {type: 'array', maxLength: 500, default: []}
        };

        this.schema = this.#schema;

        // Push entires from the schema into the working object
        Object.entries(this.#schema).forEach((item: any) => {
            const [key, value] = item;
            this.data[key] = value.default ?? null;
        });
    }

    get meta() {
        return this.#meta;
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
