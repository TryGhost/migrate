import {createReadStream} from 'node:fs';
import {stat, rename, rm, mkdir, mkdtemp, opendir} from 'node:fs/promises';
import {join, resolve, basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import ghostAPI, {mapPost} from '@tryghost/mg-ghost-api';
import {MigrateContext} from '@tryghost/mg-context';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';

const defaultOptions = {zip: true, cache: true, postsPerFile: 2000};

const initialize = (options, {infoOnly = false} = {}) => {
    return {
        title: 'Initializing Workspace',
        task: async (ctx, task) => {
            ctx.options = options;

            const selected = new Set(ctx.options.scrape);
            ctx.allowScrape = {
                all: selected.has('all'),
                assets: ['all', 'assets', 'img', 'media', 'files'].some(value => selected.has(value))
            };

            ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(ctx.options.url);
            ctx.fileCache = new fsUtils.FileCache(`ghost-${ctx.options.cacheName}`, {
                tmpPath: ctx.options.tmpPath,
                batchName: options.batch
            });

            if (!infoOnly) {
                if (!Number.isSafeInteger(options.postsPerFile) || options.postsPerFile < 1) {
                    throw new Error('--postsPerFile must be a positive integer');
                }
                ctx.outputName = ctx.fileCache.defaultZipFileName;
                const reportName = ctx.outputName.replace(/\.zip$/, '.report.json');
                ctx.reportFile = {
                    path: options.zip
                        ? resolve(options.outputPath || process.cwd(), reportName)
                        : join(ctx.fileCache.cacheDir, reportName)
                };
                ctx.migrateContext = new MigrateContext({
                    dbPath: join(ctx.fileCache.tmpDir, 'mg-context.sqlite')
                });
                await ctx.migrateContext.init();
                ctx.hasStoredSource = ctx.migrateContext.sources.hasCompletedIngestion;

                if (ctx.allowScrape.assets) {
                    ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                        allowAllDomains: true,
                        retainFailures: false,
                        strictErrors: true,
                        onFailure: failure => ctx.migrateContext.recordDiagnostic('operation:warning', failure)
                    });
                    await ctx.assetScraper.init();
                }
                ctx.linkFixer = new MgLinkFixer();
            }

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;

            if (options.batch > 0) {
                task.title += ` batch ${ctx.fileCache.batchName}`;
            }
        }
    };
};

// Point absolute links to the source site at the same path on the destination site.
const addSourceLink = (migrateContext, url, slug, newSlug) => {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return;
    }
    const path =
        slug && newSlug && slug !== newSlug ? parsed.pathname.replace(`/${slug}/`, `/${newSlug}/`) : parsed.pathname;
    migrateContext.addLink(MgLinkFixer.cleanURL(url), path);
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
 * @param {Object} suppliedOptions
 */
const getFullTaskList = suppliedOptions => {
    const options = {...defaultOptions, ...suppliedOptions};
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
            task: async (ctx, task) => {
                let imported = 0;
                await ctx.migrateContext.rebuildMappedContent(async () => {
                    for await (const record of ctx.migrateContext.sources.records()) {
                        const source = JSON.parse(record.content);
                        const post = await mapPost({...source, type: record.kind}, ctx.migrateContext);
                        post.save(ctx.migrateContext.db);
                        ctx.migrateContext.sources.link(record.id, {type: 'post', id: post.dbId});
                        if (source.url) {
                            addSourceLink(ctx.migrateContext, source.url, source.slug, post.get('slug'));
                        }
                        for (const entity of [...(source.tags || []), ...(source.authors || [])]) {
                            if (entity.url) {
                                addSourceLink(ctx.migrateContext, entity.url);
                            }
                        }
                        imported++;
                    }
                });
                ctx.summary = {selected: imported, imported, skipped: 0};
                task.output = `${imported} imported`;
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
            title: 'Update links in HTML via LinkFixer',
            task: async ctx =>
                ctx.migrateContext.forEachPost(
                    post => ctx.linkFixer.fixPost(post, url => ctx.migrateContext.findLink(url)),
                    {batchSize: 25}
                )
        },
        {
            title: 'Write Ghost import JSON file(s)',
            task: async ctx => {
                ctx.exportedFiles = 0;
                ctx.exportStaging = await mkdtemp(join(ctx.fileCache.tmpDir, 'export-'));
                for await (const _file of ctx.migrateContext.writeGhostJsonStream(ctx.exportStaging, {
                    batchSize: options.postsPerFile,
                    filename: 'ghost-import'
                })) {
                    ctx.exportedFiles++;
                    ctx.importDirectory = ctx.fileCache.zipDir;
                }
                ctx.warningCount = ctx.migrateContext.db.stmts.countMigrationEventsByType
                    .all()
                    .filter(row =>
                        [
                            'source:conflict',
                            'operation:warning',
                            'field:sanitized',
                            'slug:renamed',
                            'record:skipped'
                        ].includes(row.type)
                    )
                    .reduce((count, row) => count + row.count, 0);
                await ctx.migrateContext.writeMigrationReport(ctx.reportFile.path, {
                    ...ctx.summary,
                    warnings: ctx.warningCount,
                    status: 'complete',
                    files: ctx.exportedFiles
                });
                ctx.reportFile.size = (await stat(ctx.reportFile.path)).size;
                // The runner owns these filenames; publish only after every chunk and report succeeds.
                const entries = await opendir(ctx.fileCache.zipDir);
                for await (const entry of entries) {
                    if (
                        entry.isFile() &&
                        (entry.name === '.mg-context-export-manifest.json' ||
                            /^(?:ghost-import|posts)(?:-\d+)?\.json$/.test(entry.name))
                    ) {
                        await rm(join(ctx.fileCache.zipDir, entry.name));
                    }
                }
                for await (const entry of await opendir(ctx.exportStaging)) {
                    await rename(join(ctx.exportStaging, entry.name), join(ctx.fileCache.zipDir, entry.name));
                }
                await rm(ctx.exportStaging, {recursive: true});
                ctx.exportStaging = undefined;
                if (!options.zip) ctx.outputFile = {path: ctx.importDirectory, type: 'directory'};
            }
        },
        {
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async ctx => {
                const outputDir = resolve(options.outputPath || process.cwd());
                await mkdir(outputDir, {recursive: true});
                const finalPath = join(outputDir, ctx.outputName);
                const temporaryName = `.${randomUUID()}.zip`;
                const temporaryPath = join(outputDir, temporaryName);
                try {
                    await fsUtils.zip.write(outputDir, ctx.fileCache.zipDir, temporaryName);
                    if (options.outputStorage && typeof options.outputStorage === 'object') {
                        const upload = async (path, fileName) => {
                            const body = createReadStream(path);
                            try {
                                const remotePath = await options.outputStorage.upload({
                                    body,
                                    fileName,
                                    size: (await stat(path)).size
                                });
                                if (!body.readableEnded) {
                                    throw new Error(
                                        'outputStorage.upload must consume the readable body before resolving'
                                    );
                                }
                                return remotePath;
                            } finally {
                                body.destroy();
                            }
                        };
                        const remoteZip = await upload(temporaryPath, basename(finalPath));
                        const remoteReport = await upload(ctx.reportFile.path, basename(ctx.reportFile.path));
                        ctx.outputFile = {path: remoteZip, size: (await stat(temporaryPath)).size};
                        ctx.reportFile = {...ctx.reportFile, path: remoteReport};
                        await rm(temporaryPath);
                    } else {
                        await rename(temporaryPath, finalPath);
                        ctx.outputFile = {path: finalPath, size: (await stat(finalPath)).size};
                    }
                } catch (error) {
                    // Failed uploads retain the local ZIP for recovery.
                    ctx.recoveryFile = temporaryPath;
                    throw error;
                }
            }
        }
    ];
};

const getTaskRunner = suppliedOptions => {
    const options = {...defaultOptions, ...suppliedOptions};
    let tasks = [];

    if (options.info) {
        tasks = getInfoTaskList(options);
    } else {
        tasks = getFullTaskList(options);
    }

    const runner = makeTaskRunner(tasks, {...options, topLevel: true});
    const run = runner.run.bind(runner);
    runner.run = async (context = {errors: [], warnings: []}) => {
        let succeeded = false;
        try {
            const result = await run(context);
            succeeded = true;
            return result;
        } catch (error) {
            if (context.reportFile && context.migrateContext) {
                try {
                    context.migrateContext.recordDiagnostic('operation:failed', {reason: error.message});
                    const failurePath = context.reportFile.path.replace(/\.report\.json$/, '.failed-report.json');
                    await context.migrateContext.writeMigrationReport(failurePath, {
                        ...context.summary,
                        status: 'failed'
                    });
                    context.failedReport = failurePath;
                } catch {
                    // Preserve the original failure if initialization/report writing failed too.
                }
            }
            throw error;
        } finally {
            try {
                context.assetScraper?.close();
            } finally {
                await context.migrateContext?.close();
            }
            if (succeeded && !options.info && !options.cache && options.zip) {
                await context.fileCache.emptyCurrentCacheDir();
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
