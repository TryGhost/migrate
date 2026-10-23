import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import ghostAPI, {mapPost} from '@tryghost/mg-ghost-api';
import {MigrateContext} from '@tryghost/mg-context';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const initialize = (options, {infoOnly = false} = {}) => {
    return {
        title: 'Initializing Workspace',
        task: async (ctx, task) => {
            ctx.options = options;

            ctx.allowScrape = {
                all: ctx.options.scrape.includes('all'),
                assets:
                    ctx.options.scrape.includes('all') ||
                    ctx.options.scrape.includes('assets') ||
                    ctx.options.scrape.includes('img') ||
                    ctx.options.scrape.includes('media') ||
                    ctx.options.scrape.includes('files')
            };

            ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(ctx.options.url);
            ctx.fileCache = new fsUtils.FileCache(`ghost-${ctx.options.cacheName}`, {
                tmpPath: ctx.options.tmpPath,
                batchName: options.batch
            });

            if (!infoOnly) {
                ctx.migrateContext = new MigrateContext({
                    dbPath: join(ctx.fileCache.tmpDir, 'mg-context.sqlite')
                });
                await ctx.migrateContext.init();
                ctx.hasStoredSource = ctx.migrateContext.sources.hasCompletedIngestion;

                ctx.assetScraper = new MgAssetScraper(
                    ctx.fileCache,
                    {
                        allowAllDomains: true
                    },
                    ctx
                );
                await ctx.assetScraper.init();
            }

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;

            if (options.batch > 0) {
                task.title += ` batch ${ctx.fileCache.batchName}`;
            }
        }
    };
};

const getInfoTaskList = options => {
    return [
        initialize(options, {infoOnly: true}),
        {
            title: 'Fetch Content Info from Ghost API',
            task: async ctx => {
                try {
                    ctx.info = await ghostAPI.fetch.discover(options, ctx);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to get content from Ghost API', error});
                }
            }
        }
    ];
};

/**
 * getFullTaskList: Full Steps to Migrate from Ghost
 *
 * Wiring of the steps to migrate from Ghost.
 *
 * @param {String} pathToZip
 * @param {Object} options
 */
const getFullTaskList = options => {
    return [
        initialize(options),
        {
            title: 'Fetching content',
            skip: ctx => ctx.hasStoredSource && !options.rereadSource,
            task: async (ctx, task) => {
                try {
                    task.output = 'Discovering content';
                    await ctx.migrateContext.sources.ingest(
                        {replace: Boolean(options.rereadSource), metadata: {adapter: 'ghost-api', url: options.url}},
                        async stage => {
                            const ingestionContext = {...ctx, sourceIngestion: stage};
                            let tasks = await ghostAPI.fetch.tasks(options, ingestionContext);
                            if (options.batch > 0) {
                                tasks = [tasks[options.batch - 1]];
                            }
                            task.output = `Fetching ${tasks.length} content batches`;
                            await makeTaskRunner(tasks, {
                                ...options,
                                exitOnError: true,
                                renderer: 'silent',
                                verbose: false
                            }).run(ingestionContext);
                        }
                    );
                    task.output = null;
                } catch (error) {
                    task.output = error.message;
                    ctx.errors.push({message: 'Failed to get content from Ghost API', error});
                    throw error;
                }
            }
        },
        {
            title: 'Map stored Ghost content',
            task: async ctx => {
                await ctx.migrateContext.rebuildMappedContent(async () => {
                    for await (const record of ctx.migrateContext.sources.records()) {
                        const post = await mapPost(
                            {...JSON.parse(record.content), type: record.kind},
                            ctx.migrateContext
                        );
                        post.save(ctx.migrateContext.db);
                        ctx.migrateContext.sources.link(record.id, {type: 'post', id: post.dbId});
                    }
                });
            }
        },
        {
            title: 'Fetch images via AssetScraper',
            skip: ctx => !ctx.allowScrape.assets,
            task: (ctx, task) =>
                task.newListr(
                    [
                        ['Posts', 'forEachPost', 'countPosts'],
                        ['Tags', 'forEachTag', 'countUsedTags'],
                        ['Authors', 'forEachAuthor', 'countUsedAuthors']
                    ].map(([title, iterate, count]) => ({
                        title,
                        task: async (_ctx, subtask) => {
                            let processed = 0;
                            try {
                                const total = ctx.migrateContext.db.stmts[count].get().count;
                                subtask.title = `${title} (${processed}/${total})`;
                                await ctx.migrateContext[iterate](async entity => {
                                    subtask.output =
                                        entity.get('slug') || entity.data.title || entity.data.name || entity.ghostId;
                                    await ctx.assetScraper.processAssets(entity);
                                    subtask.title = `${title} (${++processed}/${total})`;
                                });
                                subtask.output = null;
                            } catch (error) {
                                ctx.errors.push({message: 'Failed to fetch images via AssetScraper', error});
                                throw error;
                            }
                        }
                    })),
                    {concurrent: false, exitOnError: true}
                )
        },
        {
            title: 'Write Ghost import JSON file(s)',
            task: async ctx => {
                try {
                    await ctx.migrateContext.writeGhostJson(ctx.fileCache.zipDir, {
                        batchSize: options.postsPerFile
                    });
                    await ctx.fileCache.writeErrorJSONFile(ctx.errors);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to write Ghost import JSON file', error});
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async (ctx, task) => {
                const isStorage = (options?.outputStorage && typeof options.outputStorage === 'object') ?? false;

                try {
                    let timer = Date.now();
                    const zipFinalPath = options.outputPath || process.cwd();
                    ctx.outputFile = await fsUtils.zip.write(
                        zipFinalPath,
                        ctx.fileCache.zipDir,
                        ctx.fileCache.defaultZipFileName
                    );

                    if (isStorage) {
                        const storage = options.outputStorage;
                        const localFilePath = ctx.outputFile.path;

                        const fileBuffer = await readFileSync(ctx.outputFile.path);
                        ctx.outputFile.path = await storage.upload({
                            body: fileBuffer,
                            fileName: `gh-ghost-${ctx.options.cacheName}.zip`
                        });
                        await fsUtils.zip.deleteFile(localFilePath);
                    }

                    task.output = `Successfully written zip to ${ctx.outputFile.path} in ${prettyMilliseconds(Date.now() - timer)}`;
                } catch (error) {
                    ctx.errors.push({message: 'Failed to write and upload ZIP file', error});
                    throw error;
                }
            }
        },
        {
            title: 'Close MigrateContext',
            task: async ctx => {
                try {
                    ctx.assetScraper.close();
                    await ctx.migrateContext.close();
                } catch (error) {
                    ctx.errors.push({message: 'Failed to close MigrateContext', error});
                }
            }
        },
        {
            title: 'Clearing cached files',
            enabled: () => !options.cache && options.zip,
            task: async ctx => {
                try {
                    await ctx.fileCache.emptyCurrentCacheDir();
                } catch (error) {
                    ctx.errors.push('Failed to clear cache', error);
                    throw error;
                }
            }
        }
    ];
};

const getTaskRunner = options => {
    let tasks = [];

    if (options.info) {
        tasks = getInfoTaskList(options);
    } else {
        tasks = getFullTaskList(options);
    }

    const runner = makeTaskRunner(tasks, {...options, topLevel: true});
    const run = runner.run.bind(runner);
    runner.run = async (context = {errors: [], warnings: []}) => {
        try {
            return await run(context);
        } finally {
            try {
                context.assetScraper?.close();
            } finally {
                await context.migrateContext?.close();
            }
        }
    };
    return runner;
};

export default {
    initialize,
    getInfoTaskList,
    getFullTaskList,
    getTaskRunner
};
