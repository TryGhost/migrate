import {toGhostJSON} from '@tryghost/mg-json';
import MigrateBase from './MigrateBase.js';
import PostContext, {PostConstructorOptions} from './PostContext.js';
import TagContext from './TagContext.js';
import AuthorContext from './AuthorContext.js';

export type FindPostsOptions = {
    slug?: string;
    title?: string;
    sourceAttr?: any;
    tagSlug?: string;
    tagName?: string;
    authorSlug?: string;
    authorName?: string;
    authorEmail?: string;
};

export type FindTagsOptions = {
    slug?: string;
    name?: string;
};

export type FindAuthorsOptions = {
    slug?: string;
    name?: string;
    email?: string;
};

export default class MigrateContext extends MigrateBase {
    #posts: any;

    constructor() {
        super();

        this.#posts = [];
    }

    async forEachPost(callback: Function) {
        for (const post of this.#posts) {
            await callback(post);
        }
    }

    forEachPostSync(callback: Function) {
        for (const post of this.#posts) {
            callback(post);
        }
    }

    addPost(post?: PostContext | PostConstructorOptions) {
        if (post && post instanceof PostContext) {
            this.#posts.push(post);
            return post;
        } else if (post && typeof post === 'object') {
            let emptyPost = new PostContext(post);
            this.#posts.push(emptyPost);
            return emptyPost;
        } else {
            let emptyPost = new PostContext();
            this.#posts.push(emptyPost);
            return emptyPost;
        }
    }

    findPosts({slug, title, sourceAttr, tagSlug, tagName, authorSlug, authorName, authorEmail}: FindPostsOptions = {}) : PostContext[] | null {
        if (slug) {
            return this.#posts.filter((post: PostContext) => {
                return post.get('slug') === slug;
            });
        } else if (title) {
            return this.#posts.filter((post: PostContext) => {
                return post.get('title') === title;
            });
        } else if (sourceAttr && sourceAttr.key && sourceAttr.value) {
            return this.#posts.filter((post: PostContext) => {
                return post.getSourceValue(sourceAttr.key) === sourceAttr.value;
            });
        } else if (tagSlug) {
            let foundPosts: PostContext[] = [];
            this.forEachPostSync((post: PostContext) => {
                if (post.hasTagSlug(tagSlug)) {
                    foundPosts.push(post);
                }
            });
            return foundPosts;
        } else if (tagName) {
            let foundPosts: PostContext[] = [];
            this.forEachPostSync((post: PostContext) => {
                if (post.hasTagName(tagName)) {
                    foundPosts.push(post);
                }
            });
            return foundPosts;
        } else if (authorSlug) {
            let foundPosts: PostContext[] = [];
            this.forEachPostSync((post: PostContext) => {
                if (post.hasAuthorSlug(authorSlug)) {
                    foundPosts.push(post);
                }
            });
            return foundPosts;
        } else if (authorName) {
            let foundPosts: PostContext[] = [];
            this.forEachPostSync((post: PostContext) => {
                if (post.hasAuthorName(authorName)) {
                    foundPosts.push(post);
                }
            });
            return foundPosts;
        } else if (authorEmail) {
            let foundPosts: PostContext[] = [];
            this.forEachPostSync((post: PostContext) => {
                if (post.hasAuthorEmail(authorEmail)) {
                    foundPosts.push(post);
                }
            });
            return foundPosts;
        } else {
            return null;
        }
    }

    findTags({slug, name}: FindTagsOptions = {}) : TagContext[] | null {
        // Get all tags from all posts
        let allTags: TagContext[] = [];

        this.#posts.forEach((post: PostContext) => {
            const postTags = post.get('tags');
            postTags.forEach((tag: TagContext) => {
                allTags.push(tag);
            });
        });

        if (slug) {
            return allTags.filter((tag: TagContext) => {
                return tag.get('slug') === slug;
            });
        } else if (name) {
            return allTags.filter((tag: TagContext) => {
                return tag.get('name') === name;
            });
        } else {
            return null;
        }
    }

    findAuthors({slug, name, email}: FindAuthorsOptions = {}) : AuthorContext[] | null {
        // Get all authors from all posts
        let allAuthors: AuthorContext[] = [];

        this.#posts.forEach((post: PostContext) => {
            const postTags = post.get('authors');
            postTags.forEach((author: AuthorContext) => {
                allAuthors.push(author);
            });
        });

        if (slug) {
            return allAuthors.filter((author: AuthorContext) => {
                return author.get('slug') === slug;
            });
        } else if (name) {
            return allAuthors.filter((author: AuthorContext) => {
                return author.get('name') === name;
            });
        } else if (email) {
            return allAuthors.filter((author: AuthorContext) => {
                return author.get('email') === email;
            });
        } else {
            return null;
        }
    }

    get allPosts() {
        let data = this.#posts.map((post: PostContext) => {
            return post.getFinal;
        });

        return data;
    }

    get ghostJson() {
        const result = {
            posts: this.allPosts
        };

        return toGhostJSON(result);
    }
}
