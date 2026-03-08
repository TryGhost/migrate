import {writeFile} from 'node:fs/promises';
import {extname, basename, dirname, join} from 'node:path';
import errors from '@tryghost/errors';
import {toGhostJSON} from '@tryghost/mg-json';
import MigrateBase from './MigrateBase.js';
import PostContext, {PostConstructorOptions} from './PostContext.js';
import TagContext from './TagContext.js';
import AuthorContext from './AuthorContext.js';
import {createDatabase, type DatabaseModels} from './database.js';

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

export type MigrateContextOptions = {
    contentFormat?: 'mobiledoc' | 'lexical' | 'html';
    dbPath?: string;
    ephemeral?: boolean;
};

export default class MigrateContext extends MigrateBase {
    #contentFormat: 'mobiledoc' | 'lexical' | 'html';
    #dbPath: string;
    #ephemeral: boolean;
    #db: DatabaseModels | null = null;

    constructor({contentFormat = 'html', dbPath, ephemeral}: MigrateContextOptions = {}) {
        super();

        this.#contentFormat = contentFormat;

        if (dbPath) {
            this.#dbPath = dbPath;
            this.#ephemeral = ephemeral ?? false;
        } else {
            this.#dbPath = ':memory:';
            this.#ephemeral = ephemeral ?? true;
        }
    }

    get db(): DatabaseModels {
        if (!this.#db) {
            throw new errors.InternalServerError({message: 'Database not initialized. Call init() first.'});
        }
        return this.#db;
    }

    async init() {
        const storage = this.#ephemeral ? ':memory:' : this.#dbPath;
        this.#db = await createDatabase(storage);
    }

    async close() {
        if (this.#db) {
            await this.#db.sequelize.close();
            this.#db = null;
        }
    }

    async forEachPost(callback: Function, batchSize = 100) {
        const count = await this.db.Post.count();
        for (let offset = 0; offset < count; offset += batchSize) {
            const rows = await this.db.Post.findAll({
                limit: batchSize,
                offset,
                order: [['id', 'ASC']]
            });

            for (const row of rows) {
                const post = await PostContext.fromRow(row, this.db);
                await callback(post);
            }
        }
    }

    async addPost(post?: PostContext | PostConstructorOptions): Promise<PostContext> {
        let newPost: PostContext;

        if (post && post instanceof PostContext) {
            newPost = post;
        } else if (post && typeof post === 'object') {
            newPost = new PostContext({...post, contentFormat: this.#contentFormat});
        } else {
            newPost = new PostContext({contentFormat: this.#contentFormat});
        }

        await newPost.save(this.db);
        return newPost;
    }

    async getAllPosts(): Promise<PostContext[]> {
        const rows = await this.db.Post.findAll({order: [['id', 'ASC']]});
        const posts: PostContext[] = [];
        for (const row of rows) {
            posts.push(await PostContext.fromRow(row, this.db));
        }
        return posts;
    }

    async findPosts({slug, title, sourceAttr, tagSlug, tagName, authorSlug, authorName, authorEmail}: FindPostsOptions = {}): Promise<PostContext[] | null> {
        if (slug) {
            const rows = await this.db.Post.findAll({order: [['id', 'ASC']]});
            const results: PostContext[] = [];
            for (const row of rows) {
                const data = JSON.parse(row.get('data') as string);
                if (data.slug === slug) {
                    results.push(await PostContext.fromRow(row, this.db));
                }
            }
            return results;
        } else if (title) {
            const rows = await this.db.Post.findAll({order: [['id', 'ASC']]});
            const results: PostContext[] = [];
            for (const row of rows) {
                const data = JSON.parse(row.get('data') as string);
                if (data.title === title) {
                    results.push(await PostContext.fromRow(row, this.db));
                }
            }
            return results;
        } else if (sourceAttr && sourceAttr.key && sourceAttr.value) {
            const rows = await this.db.Post.findAll({order: [['id', 'ASC']]});
            const results: PostContext[] = [];
            for (const row of rows) {
                const source = JSON.parse(row.get('source') as string);
                if (source[sourceAttr.key] === sourceAttr.value) {
                    results.push(await PostContext.fromRow(row, this.db));
                }
            }
            return results;
        } else if (tagSlug) {
            const tag = await this.db.Tag.findOne({where: {slug: tagSlug}});
            if (!tag) {
                return [];
            }
            const postTags = await this.db.PostTag.findAll({where: {tag_id: tag.get('id') as number}});
            const results: PostContext[] = [];
            for (const pt of postTags) {
                const postRow = await this.db.Post.findByPk(pt.get('post_id') as number);
                if (postRow) {
                    results.push(await PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (tagName) {
            const tags = await this.db.Tag.findAll({where: {name: tagName}});
            const postIds = new Set<number>();
            for (const t of tags) {
                const postTags = await this.db.PostTag.findAll({where: {tag_id: t.get('id') as number}});
                for (const pt of postTags) {
                    postIds.add(pt.get('post_id') as number);
                }
            }
            const results: PostContext[] = [];
            for (const postId of postIds) {
                const postRow = await this.db.Post.findByPk(postId);
                if (postRow) {
                    results.push(await PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (authorSlug) {
            const author = await this.db.Author.findOne({where: {slug: authorSlug}});
            if (!author) {
                return [];
            }
            const postAuthors = await this.db.PostAuthor.findAll({where: {author_id: author.get('id') as number}});
            const results: PostContext[] = [];
            for (const pa of postAuthors) {
                const postRow = await this.db.Post.findByPk(pa.get('post_id') as number);
                if (postRow) {
                    results.push(await PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (authorName) {
            const authors = await this.db.Author.findAll({where: {name: authorName}});
            const postIds = new Set<number>();
            for (const a of authors) {
                const postAuthors = await this.db.PostAuthor.findAll({where: {author_id: a.get('id') as number}});
                for (const pa of postAuthors) {
                    postIds.add(pa.get('post_id') as number);
                }
            }
            const results: PostContext[] = [];
            for (const postId of postIds) {
                const postRow = await this.db.Post.findByPk(postId);
                if (postRow) {
                    results.push(await PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (authorEmail) {
            const author = await this.db.Author.findOne({where: {email: authorEmail}});
            if (!author) {
                return [];
            }
            const postAuthors = await this.db.PostAuthor.findAll({where: {author_id: author.get('id') as number}});
            const results: PostContext[] = [];
            for (const pa of postAuthors) {
                const postRow = await this.db.Post.findByPk(pa.get('post_id') as number);
                if (postRow) {
                    results.push(await PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else {
            return null;
        }
    }

    async findTags({slug, name}: FindTagsOptions = {}): Promise<TagContext[] | null> {
        if (slug) {
            const rows = await this.db.Tag.findAll({where: {slug}});
            return rows.map((row: any) => TagContext.fromRow(row));
        } else if (name) {
            const rows = await this.db.Tag.findAll({where: {name}});
            return rows.map((row: any) => TagContext.fromRow(row));
        } else {
            return null;
        }
    }

    async findAuthors({slug, name, email}: FindAuthorsOptions = {}): Promise<AuthorContext[] | null> {
        if (slug) {
            const rows = await this.db.Author.findAll({where: {slug}});
            return rows.map((row: any) => AuthorContext.fromRow(row));
        } else if (name) {
            const rows = await this.db.Author.findAll({where: {name}});
            return rows.map((row: any) => AuthorContext.fromRow(row));
        } else if (email) {
            const rows = await this.db.Author.findAll({where: {email}});
            return rows.map((row: any) => AuthorContext.fromRow(row));
        } else {
            return null;
        }
    }

    async writeGhostJson(filePath: string, {batchSize = 5000}: {batchSize?: number} = {}): Promise<string[]> {
        const count = await this.db.Post.count();
        const totalBatches = Math.max(1, Math.ceil(count / batchSize));
        const writtenFiles: string[] = [];

        for (let batch = 0; batch < totalBatches; batch++) {
            const offset = batch * batchSize;
            const rows = await this.db.Post.findAll({
                limit: batchSize,
                offset,
                order: [['id', 'ASC']]
            });

            const posts: PostContext[] = [];
            for (const row of rows) {
                posts.push(await PostContext.fromRow(row, this.db));
            }

            const result = {
                posts: posts.map((post: PostContext) => post.getFinal)
            };
            const json = await toGhostJSON(result);

            let outputPath: string;
            if (totalBatches === 1) {
                outputPath = filePath;
            } else {
                const ext = extname(filePath);
                const base = basename(filePath, ext);
                const dir = dirname(filePath);
                outputPath = join(dir, `${base}-${batch + 1}${ext}`);
            }

            await writeFile(outputPath, JSON.stringify(json, null, 2));
            writtenFiles.push(outputPath);
        }

        return writtenFiles;
    }
}
