import {stat, mkdir, open, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import errors from '@tryghost/errors';

import MigrateBase from './MigrateBase.js';
import PostContext, {PostConstructorOptions} from './PostContext.js';
import TagContext from './TagContext.js';
import AuthorContext from './AuthorContext.js';
import {createDatabase, type DatabaseModels} from './database.js';
import {withTransaction, findByIds, findByColumn, buildDateWhere, buildFullWhere, countWhere, findPostsWhere, findPostIdColumnsWhere} from './db-helpers.js';

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

export interface WrittenFile {
    path: string;
    name: string;
    size: number;
    posts: number;
}

export interface PostFilter {
    tag?: {slug?: string; name?: string};
    author?: {slug?: string; name?: string; email?: string};
    createdAt?: {before?: Date; after?: Date; onOrBefore?: Date; onOrAfter?: Date};
    publishedAt?: {before?: Date; after?: Date; onOrBefore?: Date; onOrAfter?: Date};
}

export interface ForEachPostOptions {
    batchSize?: number;
    filter?: PostFilter;
    progress?: (processed: number, total: number) => void; // eslint-disable-line no-unused-vars
}

export type MigrateContextOptions = {
    contentFormat?: 'mobiledoc' | 'lexical' | 'html';
    dbPath?: string;
    ephemeral?: boolean;
    warnOnLookupKeyDuplicate?: boolean;
};

export default class MigrateContext extends MigrateBase {
    #contentFormat: 'mobiledoc' | 'lexical' | 'html';
    #dbPath: string;
    #ephemeral: boolean;
    #warnOnLookupKeyDuplicate: boolean;
    #db: DatabaseModels | null = null;

    constructor({contentFormat = 'lexical', dbPath, ephemeral, warnOnLookupKeyDuplicate = false}: MigrateContextOptions = {}) {
        super();

        this.#contentFormat = contentFormat;
        this.#warnOnLookupKeyDuplicate = warnOnLookupKeyDuplicate;

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
        this.#db = createDatabase(storage);
    }

    async close() {
        if (this.#db) {
            this.#db.db.close();
            this.#db = null;
        }
    }

    async transaction<T>(callback: () => T | Promise<T>): Promise<T> {
        this.db.db.exec('BEGIN');
        this.db.inTransaction = true;
        try {
            const result = await callback();
            this.db.db.exec('COMMIT');
            return result;
        } catch (err) {
            this.db.db.exec('ROLLBACK');
            throw err;
        /* c8 ignore next */ } finally {
            this.db.inTransaction = false;
        }
    }

    #resolveFilterPostIds(filter?: PostFilter): number[] | null {
        if (!filter || (!filter.tag && !filter.author)) {
            return null;
        }

        let tagPostIds: Set<number> | null = null;
        let authorPostIds: Set<number> | null = null;

        if (filter.tag) {
            let tags: any[] = [];
            if (filter.tag.slug) {
                tags = this.db.stmts.findTagsBySlug.all(filter.tag.slug) as any[];
            } else if (filter.tag.name) {
                tags = this.db.stmts.findTagsByName.all(filter.tag.name) as any[];
            }
            tagPostIds = new Set<number>();
            for (const tag of tags) {
                const postTags = this.db.stmts.findPostTagsByTagId.all(tag.id) as any[];
                for (const pt of postTags) {
                    tagPostIds.add(pt.post_id as number);
                }
            }
        }

        if (filter.author) {
            let authors: any[] = [];
            if (filter.author.slug) {
                authors = this.db.stmts.findAuthorsBySlug.all(filter.author.slug) as any[];
            } else if (filter.author.name) {
                authors = this.db.stmts.findAuthorsByName.all(filter.author.name) as any[];
            } else if (filter.author.email) {
                authors = this.db.stmts.findAuthorsByEmail.all(filter.author.email) as any[];
            }
            authorPostIds = new Set<number>();
            for (const author of authors) {
                const postAuthors = this.db.stmts.findPostAuthorsByAuthorId.all(author.id) as any[];
                for (const pa of postAuthors) {
                    authorPostIds.add(pa.post_id as number);
                }
            }
        }

        let ids: number[];
        if (tagPostIds && authorPostIds) {
            ids = [...tagPostIds].filter(id => authorPostIds!.has(id));
        } else if (tagPostIds) {
            ids = [...tagPostIds];
        } else {
            ids = [...authorPostIds!];
        }

        return ids.sort((a, b) => a - b);
    }

    #buildFilterWhere(filter?: PostFilter) {
        const postIds = this.#resolveFilterPostIds(filter);
        const dateWhere = buildDateWhere(filter);
        return buildFullWhere(dateWhere, postIds);
    }

    // eslint-disable-next-line no-unused-vars
    async forEachPost(callback: (post: PostContext) => Promise<void>, {batchSize = 100, filter, progress}: ForEachPostOptions = {}) {
        const where = this.#buildFilterWhere(filter);
        const total = countWhere(this.db, where);
        let processed = 0;

        for (let offset = 0; offset < total; offset += batchSize) {
            const rows = findPostsWhere(this.db, where, batchSize, offset);

            for (const row of rows) {
                const post = PostContext.fromRow(row, this.db);
                await callback(post);
                withTransaction(this.db, () => {
                    post.save(this.db);
                });
                processed += 1;
            }

            if (progress) {
                progress(processed, total);
            }
        }
    }

    async addPost(post?: PostContext | PostConstructorOptions): Promise<PostContext> {
        let newPost: PostContext;

        if (post && post instanceof PostContext) {
            newPost = post;
            newPost.warnOnLookupKeyDuplicate = this.#warnOnLookupKeyDuplicate;
            newPost.save(this.db);
        } else if (post && typeof post === 'object') {
            newPost = new PostContext({...post, contentFormat: this.#contentFormat});
            newPost.warnOnLookupKeyDuplicate = this.#warnOnLookupKeyDuplicate;
        } else {
            newPost = new PostContext({contentFormat: this.#contentFormat});
            newPost.warnOnLookupKeyDuplicate = this.#warnOnLookupKeyDuplicate;
        }

        return newPost;
    }

    async getAllPosts(): Promise<PostContext[]> {
        const rows = this.db.stmts.findAllPostsOrdered.all() as any[];
        return rows.map((row: any) => PostContext.fromRow(row, this.db));
    }

    async findPosts({slug, title, sourceAttr, tagSlug, tagName, authorSlug, authorName, authorEmail}: FindPostsOptions = {}): Promise<PostContext[] | null> {
        if (slug) {
            const rows = this.db.stmts.findAllPostsOrdered.all() as any[];
            const results: PostContext[] = [];
            for (const row of rows) {
                const data = JSON.parse(row.data as string);
                if (data.slug === slug) {
                    results.push(PostContext.fromRow(row, this.db));
                }
            }
            return results;
        } else if (title) {
            const rows = this.db.stmts.findAllPostsOrdered.all() as any[];
            const results: PostContext[] = [];
            for (const row of rows) {
                const data = JSON.parse(row.data as string);
                if (data.title === title) {
                    results.push(PostContext.fromRow(row, this.db));
                }
            }
            return results;
        } else if (sourceAttr && sourceAttr.key && sourceAttr.value) {
            const rows = this.db.stmts.findAllPostsOrdered.all() as any[];
            const results: PostContext[] = [];
            for (const row of rows) {
                const source = JSON.parse(row.source as string);
                if (source[sourceAttr.key] === sourceAttr.value) {
                    results.push(PostContext.fromRow(row, this.db));
                }
            }
            return results;
        } else if (tagSlug) {
            const tag = this.db.stmts.findTagBySlug.get(tagSlug) as any;
            if (!tag) {
                return [];
            }
            const postTags = this.db.stmts.findPostTagsByTagId.all(tag.id) as any[];
            const results: PostContext[] = [];
            for (const pt of postTags) {
                const postRow = this.db.stmts.findPostById.get(pt.post_id) as any;
                if (postRow) {
                    results.push(PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (tagName) {
            const tags = this.db.stmts.findTagsByName.all(tagName) as any[];
            const postIds = new Set<number>();
            for (const t of tags) {
                const postTags = this.db.stmts.findPostTagsByTagId.all(t.id) as any[];
                for (const pt of postTags) {
                    postIds.add(pt.post_id as number);
                }
            }
            const results: PostContext[] = [];
            for (const postId of postIds) {
                const postRow = this.db.stmts.findPostById.get(postId) as any;
                if (postRow) {
                    results.push(PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (authorSlug) {
            const author = this.db.stmts.findAuthorBySlug.get(authorSlug) as any;
            if (!author) {
                return [];
            }
            const postAuthors = this.db.stmts.findPostAuthorsByAuthorId.all(author.id) as any[];
            const results: PostContext[] = [];
            for (const pa of postAuthors) {
                const postRow = this.db.stmts.findPostById.get(pa.post_id) as any;
                if (postRow) {
                    results.push(PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (authorName) {
            const authors = this.db.stmts.findAuthorsByName.all(authorName) as any[];
            const postIds = new Set<number>();
            for (const a of authors) {
                const postAuthors = this.db.stmts.findPostAuthorsByAuthorId.all(a.id) as any[];
                for (const pa of postAuthors) {
                    postIds.add(pa.post_id as number);
                }
            }
            const results: PostContext[] = [];
            for (const postId of postIds) {
                const postRow = this.db.stmts.findPostById.get(postId) as any;
                if (postRow) {
                    results.push(PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else if (authorEmail) {
            const author = this.db.stmts.findAuthorByEmail.get(authorEmail) as any;
            if (!author) {
                return [];
            }
            const postAuthors = this.db.stmts.findPostAuthorsByAuthorId.all(author.id) as any[];
            const results: PostContext[] = [];
            for (const pa of postAuthors) {
                const postRow = this.db.stmts.findPostById.get(pa.post_id) as any;
                if (postRow) {
                    results.push(PostContext.fromRow(postRow, this.db));
                }
            }
            return results;
        } else {
            return null;
        }
    }

    async findTags({slug, name}: FindTagsOptions = {}): Promise<TagContext[] | null> {
        if (slug) {
            const rows = this.db.stmts.findTagsBySlug.all(slug) as any[];
            return rows.map((row: any) => TagContext.fromRow(row));
        } else if (name) {
            const rows = this.db.stmts.findTagsByName.all(name) as any[];
            return rows.map((row: any) => TagContext.fromRow(row));
        } else {
            return null;
        }
    }

    async findAuthors({slug, name, email}: FindAuthorsOptions = {}): Promise<AuthorContext[] | null> {
        if (slug) {
            const rows = this.db.stmts.findAuthorsBySlug.all(slug) as any[];
            return rows.map((row: any) => AuthorContext.fromRow(row));
        } else if (name) {
            const rows = this.db.stmts.findAuthorsByName.all(name) as any[];
            return rows.map((row: any) => AuthorContext.fromRow(row));
        } else if (email) {
            const rows = this.db.stmts.findAuthorsByEmail.all(email) as any[];
            return rows.map((row: any) => AuthorContext.fromRow(row));
        } else {
            return null;
        }
    }

    // eslint-disable-next-line no-unused-vars
    async forEachGhostPost(callback: (json: any, post: PostContext) => Promise<void>, {batchSize = 100, filter, progress}: ForEachPostOptions = {}) {
        const where = this.#buildFilterWhere(filter);
        const total = countWhere(this.db, where);
        let processed = 0;

        for (let offset = 0; offset < total; offset += batchSize) {
            const rows = findPostsWhere(this.db, where, batchSize, offset);

            for (const row of rows) {
                const post = PostContext.fromRow(row, this.db);
                const postFinal = post.getFinal;
                const postData = {...postFinal.data};
                postData.tags = postData.tags.map((t: any) => t.data);
                postData.authors = postData.authors.map((a: any) => a.data);
                await callback(postData, post);
                processed += 1;
            }

            if (progress) {
                progress(processed, total);
            }
        }
    }

    // eslint-disable-next-line no-unused-vars
    async writeGhostJson(outputDir: string, {batchSize = 5000, filename: rawFilename = 'posts', filter, onWrite}: {batchSize?: number; filename?: string; filter?: PostFilter; onWrite?: (file: WrittenFile) => void} = {}): Promise<WrittenFile[]> {
        const filename = rawFilename.replace(/\.json$/i, '');
        await mkdir(outputDir, {recursive: true});
        const where = this.#buildFilterWhere(filter);
        const count = countWhere(this.db, where);
        const totalBatches = Math.max(1, Math.ceil(count / batchSize));
        const writtenFiles: WrittenFile[] = [];

        const subBatchSize = 200;

        for (let batch = 0; batch < totalBatches; batch++) {
            const batchOffset = batch * batchSize;
            const batchLimit = Math.min(batchSize, count - batchOffset);

            // Query post IDs and ghost IDs for this file batch
            const postIdRows = findPostIdColumnsWhere(this.db, where, batchLimit, batchOffset);
            const postIds = postIdRows.map((r: any) => r.id as number);
            const ghostIdMap = new Map<number, string>(postIdRows.map((r: any) => [r.id, r.ghost_id]));

            // Load junction + entity data from DB (small — tags/authors are few)
            const postTagRows = findByColumn(this.db, 'PostTags', 'post_id', postIds, 'post_id ASC, sort_order ASC');
            const postAuthorRows = findByColumn(this.db, 'PostAuthors', 'post_id', postIds, 'post_id ASC, sort_order ASC');

            const tagDbIds = [...new Set(postTagRows.map((r: any) => r.tag_id as number))];
            const authorDbIds = [...new Set(postAuthorRows.map((r: any) => r.author_id as number))];

            const tagRows = findByIds(this.db, 'Tags', tagDbIds);
            const authorRows = findByIds(this.db, 'Authors', authorDbIds);

            // Build small Ghost JSON arrays
            const tagGhostIds = new Map<number, string>();
            const tags = tagRows.map((r: any) => {
                const data = JSON.parse(r.data);
                tagGhostIds.set(r.id, r.ghost_id);
                return {id: r.ghost_id, ...data};
            });
            const authorGhostIds = new Map<number, string>();
            const users = authorRows.map((r: any) => {
                const data = JSON.parse(r.data);
                authorGhostIds.set(r.id, r.ghost_id);
                return {id: r.ghost_id, ...data};
            });

            const postsTags = postTagRows.map((r: any) => ({
                post_id: ghostIdMap.get(r.post_id),
                tag_id: tagGhostIds.get(r.tag_id)
            }));
            const postsAuthors = postAuthorRows.map((r: any) => ({
                post_id: ghostIdMap.get(r.post_id),
                author_id: authorGhostIds.get(r.author_id)
            }));

            // Stream file: posts are loaded and written in sub-batches
            const fileName = totalBatches === 1
                ? `${filename}.json`
                : `${filename}-${batch + 1}.json`;
            const outputPath = join(outputDir, fileName);
            const fh = await open(outputPath, 'w');
            const postsMeta: any[] = [];
            let postCount = 0;

            // Indent a JSON.stringify block so all lines after the first are at the given depth
            const pretty = (obj: any, depth: number) => {
                const pad = ' '.repeat(depth);
                return JSON.stringify(obj, null, 2).replace(/\n/g, `\n${pad}`);
            };

            try {
                await fh.write('{\n');
                await fh.write(`  "meta": ${pretty({exported_on: Date.now(), version: '2.0.0'}, 2)},\n`);
                await fh.write('  "data": {\n');
                await fh.write('    "posts": [\n');

                // Stream posts in sub-batches
                for (let sub = 0; sub < batchLimit; sub += subBatchSize) {
                    const rows = findPostsWhere(this.db, where, Math.min(subBatchSize, batchLimit - sub), batchOffset + sub);

                    for (const row of rows) {
                        const {post, meta, didConvert} = PostContext.toGhostPost(row);

                        // Cache freshly converted content back to DB for future reads
                        if (didConvert) {
                            const cached = JSON.parse(row.data as string);
                            const cf = row.content_format as string;
                            if (cf === 'lexical') {
                                cached.lexical = post.lexical;
                            } else if (cf === 'mobiledoc') {
                                cached.mobiledoc = post.mobiledoc;
                            }
                            this.db.stmts.updatePostData.run(JSON.stringify(cached), row.id as number);
                        }

                        if (postCount > 0) {
                            await fh.write(',\n');
                        }
                        await fh.write(`      ${pretty(post, 6)}`);
                        if (meta) {
                            postsMeta.push(meta);
                        }
                        postCount += 1;
                    }
                }

                await fh.write('\n    ],\n');
                await fh.write(`    "users": ${pretty(users, 4)},\n`);
                await fh.write(`    "tags": ${pretty(tags, 4)},\n`);
                await fh.write(`    "posts_authors": ${pretty(postsAuthors, 4)},\n`);
                await fh.write(`    "posts_tags": ${pretty(postsTags, 4)},\n`);
                await fh.write(`    "posts_meta": ${pretty(postsMeta, 4)}\n`);
                await fh.write('  }\n}\n');
            } finally {
                await fh.close();
            }

            const fileStats = await stat(outputPath);
            const written: WrittenFile = {
                path: resolve(outputPath),
                name: fileName,
                size: fileStats.size,
                posts: postCount
            };
            writtenFiles.push(written);
            if (onWrite) {
                onWrite(written);
            }
        }

        return writtenFiles;
    }

    async writeGhostTagsJson(outputDir: string, {filename = 'tags'}: {filename?: string} = {}): Promise<WrittenFile> {
        const name = filename.replace(/\.json$/i, '') + '.json';
        await mkdir(outputDir, {recursive: true});

        const rows = this.db.stmts.findUsedTags.all() as any[];
        const tags = rows.map((r: any) => ({id: r.ghost_id, ...JSON.parse(r.data)}));

        const outputPath = join(outputDir, name);
        const content = JSON.stringify({
            meta: {exported_on: Date.now(), version: '2.0.0'},
            data: {tags}
        }, null, 2);

        await writeFile(outputPath, content);
        const fileStats = await stat(outputPath);

        return {path: resolve(outputPath), name, size: fileStats.size, posts: 0};
    }

    async writeGhostUsersJson(outputDir: string, {filename = 'users'}: {filename?: string} = {}): Promise<WrittenFile> {
        const name = filename.replace(/\.json$/i, '') + '.json';
        await mkdir(outputDir, {recursive: true});

        const rows = this.db.stmts.findUsedAuthors.all() as any[];
        const users = rows.map((r: any) => ({id: r.ghost_id, ...JSON.parse(r.data)}));

        const outputPath = join(outputDir, name);
        const content = JSON.stringify({
            meta: {exported_on: Date.now(), version: '2.0.0'},
            data: {users}
        }, null, 2);

        await writeFile(outputPath, content);
        const fileStats = await stat(outputPath);

        return {path: resolve(outputPath), name, size: fileStats.size, posts: 0};
    }
}
