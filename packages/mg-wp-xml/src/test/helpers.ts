import {mkdtemp, writeFile, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MigrateContext} from '@tryghost/mg-context';
import * as transforms from '../lib/process.js';
import {inspectSource, ingest, map, sourceSite, sourceUrl} from '../index.js';

// Project context objects into the assertions used by the original behavior tests.
async function all(input: string | string[], ctx: any): Promise<any> {
    const directory = await mkdtemp(join(tmpdir(), 'wp-behavior-'));
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    try {
        for (const [index, xml] of (Array.isArray(input) ? input : [input]).entries()) {
            await writeFile(join(directory, `${index}.xml`), xml);
        }
        await ingest(await inspectSource(directory), context);
        ctx.options.url = (await sourceSite(context)).url;
        await map(ctx.options, context, {fileCache: ctx.fileCache});
        const posts: any[] = [];
        for await (const post of context.streamPosts()) {
            const data = {...post.data};
            data.tags = data.tags.map((tag: any) => {
                const name = tag.data.name;
                const url =
                    name === '#wp'
                        ? 'migrator-added-tag'
                        : name.startsWith('#wp-')
                          ? `migrator-added-tag-${name.slice(4)}`
                          : ctx.options.addTag === name
                            ? `migrator-added-tag-${tag.data.slug}`
                            : `/tag/${tag.data.slug}`;
                return {url, data: tag.data};
            });
            const authors = data.authors.map((author: any) => ({url: author.data.slug, data: author.data}));
            data.author = authors.length === 1 ? authors[0] : undefined;
            data.authors = authors.length > 1 ? authors : undefined;
            const original = JSON.parse(context.sources.get('item', post.lookupKey!)!.content);
            posts.push({
                url: sourceUrl(transforms.getText(original.link), ctx.options.url),
                wpPostType: transforms.getText(original['wp:post_type']),
                data
            });
        }
        const users: any[] = [];
        for await (const author of context.sources.records({kind: 'author'})) {
            users.push(transforms.processUser(JSON.parse(author.content)));
        }
        return {posts, users};
    } finally {
        await context.close();
        await rm(directory, {recursive: true, force: true});
    }
}

export async function readFileOrFolder(path: string): Promise<string[]> {
    const snapshot = await inspectSource(path);
    return await Promise.all(snapshot.files.map(file => readFile(file.path, 'utf8')));
}

export default {...transforms, all};
