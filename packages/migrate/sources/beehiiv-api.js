import {createReadStream} from 'node:fs';
import {stat, rename, rm, mkdir, mkdtemp, opendir} from 'node:fs/promises';
import {join, resolve, basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {MigrateContext} from '@tryghost/mg-context';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {ingest, map} from '@tryghost/mg-beehiiv-api';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {streamGhostUsers, GhostUserFetchError} from '@tryghost/mg-ghost-authors';

const getTaskRunner = suppliedOptions => {
    const options = {scrape: ['all'], zip: true, cache: true, report: false, postsPerFile: 2000, ...suppliedOptions};
    const tasks = [
        {
            title: 'Initializing',
            task: async ctx => {
                if (!Number.isSafeInteger(options.postsPerFile) || options.postsPerFile < 1) {
                    throw new Error('--postsPerFile must be a positive integer');
                }
                ctx.options = options;
                // Without --cacheName the workspace is keyed by the full publication ID.
                ctx.fileCache = new fsUtils.FileCache(`beehiiv-api-${options.cacheName || options.id}`, {
                    tmpPath: options.tmpPath
                });
                const selected = new Set(options.scrape);
                ctx.allowScrape = {
                    assets: ['all', 'assets', 'img', 'media', 'files'].some(value => selected.has(value))
                };
                ctx.outputName = ctx.fileCache.defaultZipFileName;
                if (options.report) {
                    const reportName = ctx.outputName.replace(/\.zip$/, '.report.json');
                    ctx.reportFile = {
                        path: options.zip
                            ? resolve(options.outputPath || process.cwd(), reportName)
                            : join(ctx.fileCache.cacheDir, reportName)
                    };
                }
                ctx.migrateContext = new MigrateContext({dbPath: join(ctx.fileCache.tmpDir, 'mg-context.sqlite')});
                await ctx.migrateContext.init();
                if (ctx.allowScrape.assets) {
                    ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                        domains: ['http://media.beehiiv.com', 'https://media.beehiiv.com'],
                        retainFailures: false,
                        strictErrors: true,
                        onFailure: failure => ctx.migrateContext.recordDiagnostic('operation:warning', failure)
                    });
                    await ctx.assetScraper.init();
                }
                ctx.linkFixer = new MgLinkFixer();
            }
        },
        {
            title: 'Fetching content',
            task: async (ctx, task) => {
                try {
                    if (!ctx.migrateContext.sources.hasCompletedIngestion || options.rereadSource) {
                        task.output = `Discovering posts in ${options.id}`;
                        await ingest(options.id, ctx.migrateContext, {
                            key: options.key,
                            replace: Boolean(options.rereadSource),
                            onProgress: title => {
                                task.output = title;
                            }
                        });
                    } else {
                        task.output = 'Reading stored beehiiv content';
                    }
                    task.output = null;
                } catch (error) {
                    task.output = error.message;
                    throw error;
                }
            }
        },
        {
            title: 'Map beehiiv content',
            task: async (ctx, task) => {
                async function* users() {
                    if (options.ghostApiUrl && options.ghostAdminKey) {
                        try {
                            yield* streamGhostUsers({
                                apiUrl: options.ghostApiUrl,
                                adminKey: options.ghostAdminKey,
                                fileCache: ctx.fileCache
                            });
                        } catch (error) {
                            if (!(error instanceof GhostUserFetchError)) {
                                throw error;
                            }
                            ctx.migrateContext.recordDiagnostic('operation:warning', {
                                operation: 'Ghost author matching',
                                reason: error.message
                            });
                        }
                    }
                }
                ctx.summary = await map(options, ctx.migrateContext, {ghostUsers: users()});
                task.output = `${ctx.summary.imported} imported, ${ctx.summary.skipped} skipped`;
                if (ctx.summary.skipped > 0 && ctx.summary.imported === 0) {
                    throw new Error('Every selected beehiiv post was invalid. See the migration report.');
                }
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
                            const total = ctx.migrateContext.db.stmts[count].get().count;
                            subtask.title = `${title} (${processed}/${total})`;
                            await ctx.migrateContext[iterate](
                                async entity => {
                                    subtask.output =
                                        entity.get('slug') || entity.data.title || entity.data.name || entity.ghostId;
                                    await ctx.assetScraper.processAssets(entity);
                                    subtask.title = `${title} (${++processed}/${total})`;
                                },
                                {batchSize: 25}
                            );
                            subtask.output = null;
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
            title: 'Write Ghost import JSON files',
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
                ctx.warningCount = ctx.migrateContext.countWarnings();
                if (ctx.reportFile) {
                    await ctx.migrateContext.writeMigrationReport(ctx.reportFile.path, {
                        ...ctx.summary,
                        warnings: ctx.warningCount,
                        status: 'complete',
                        files: ctx.exportedFiles
                    });
                    ctx.reportFile.size = (await stat(ctx.reportFile.path)).size;
                }
                // The runner owns these filenames; publish only after every chunk and report succeeds.
                for await (const entry of await opendir(ctx.fileCache.zipDir)) {
                    if (entry.isFile() && /^ghost-import(?:-\d+)?\.json$/.test(entry.name)) {
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
            title: 'Write Ghost import ZIP',
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
                        if (ctx.reportFile) {
                            const remoteReport = await upload(ctx.reportFile.path, basename(ctx.reportFile.path));
                            ctx.reportFile = {...ctx.reportFile, path: remoteReport};
                        }
                        ctx.outputFile = {path: remoteZip, size: (await stat(temporaryPath)).size};
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
            if (succeeded && !options.cache && options.zip) {
                await context.fileCache.emptyCurrentCacheDir();
            }
        }
    };
    return runner;
};

export default {getTaskRunner};
