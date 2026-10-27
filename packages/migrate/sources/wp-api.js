import {createReadStream} from 'node:fs';
import {stat, rename, rm, mkdir, mkdtemp, opendir} from 'node:fs/promises';
import {join, resolve, basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {MigrateContext} from '@tryghost/mg-context';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {discover, ingest, map, wpCDNToLocal} from '@tryghost/mg-wp-api';
import {streamGhostUsers, GhostUserFetchError} from '@tryghost/mg-ghost-authors';

const scrapeConfig = {
    posts: {
        html: {
            selector: 'div.article-header__image',
            how: 'html',
            convert: x => {
                if (!x) {
                    return;
                }
                // we're fetching all inner html for custom used feature media,
                // such as iFrames or videos.
                return !x.match(/^(<img|<figure)/) && x;
            }
        },
        meta_title: {
            selector: 'title'
        },
        meta_description: {
            selector: 'meta[name="description"]',
            attr: 'content',
            convert: x => {
                if (!x) {
                    return;
                }
                return x.slice(0, 499);
            }
        },
        og_image: {
            selector: 'meta[property="og:image"]',
            attr: 'content',
            convert: x => {
                return wpCDNToLocal(x);
            }
        },
        og_title: {
            selector: 'meta[property="og:title"]',
            attr: 'content'
        },
        og_description: {
            selector: 'meta[property="og:description"]',
            attr: 'content',
            convert: x => {
                if (!x) {
                    return;
                }
                return x.slice(0, 499);
            }
        },
        twitter_image: {
            selector: 'meta[name="twitter:image"], meta[name="twitter:image:src"]',
            attr: 'content',
            convert: x => {
                return wpCDNToLocal(x);
            }
        },
        twitter_title: {
            selector: 'meta[name="twitter:title"]',
            attr: 'content'
        },
        twitter_description: {
            selector: 'meta[name="twitter:description"]',
            attr: 'content',
            convert: x => {
                if (!x) {
                    return;
                }
                return x.slice(0, 499);
            }
        },
        codeinjection_head: {
            selector: 'body > style',
            convert: x => {
                if (!x) {
                    return;
                }
                return `<style>${x}</style>`;
            }
        }
    }
};

const postProcessor = (scrapedData, data, options) => {
    if (scrapedData.html) {
        scrapedData.html = `<!--kg-card-begin: html-->${scrapedData.html}<!--kg-card-end: html-->${data.html}`;
    } else {
        delete scrapedData.html;
    }

    if (scrapedData.og_image) {
        scrapedData.og_image = scrapedData.og_image.replace(/(?:-\d{2,4}x\d{2,4})(.\w+)$/gi, '$1');
    }

    if (scrapedData.twitter_image) {
        scrapedData.twitter_image = scrapedData.twitter_image.replace(/(?:-\d{2,4}x\d{2,4})(.\w+)$/gi, '$1');
    }

    if (options.featureImage === 'og:image' && scrapedData.og_image) {
        scrapedData.feature_image = scrapedData.og_image;
    }

    return scrapedData;
};

const getInfoTaskList = options => {
    return [
        {
            title: 'Fetch Content Info from WP API',
            task: async ctx => {
                ctx.options = options;
                try {
                    ctx.info = await discover(options.url, {
                        ...options,
                        apiUser: ctx.apiUser,
                        usersJSON: ctx.usersJSON
                    });
                } catch (error) {
                    ctx.errors.push({message: 'Failed to fetch content from WP API', error});
                    throw error;
                }
            }
        }
    ];
};

const getFullTaskRunner = suppliedOptions => {
    const options = {scrape: ['all'], zip: true, cache: true, postsPerFile: 2000, batch: 0, ...suppliedOptions};
    const tasks = [
        {
            title: 'Initializing',
            task: async (ctx, task) => {
                if (!Number.isSafeInteger(options.postsPerFile) || options.postsPerFile < 1) {
                    throw new Error('--postsPerFile must be a positive integer');
                }
                ctx.options = options;
                // Without --cacheName the workspace is keyed by the full site URL.
                ctx.fileCache = new fsUtils.FileCache(options.cacheName ? `wp-api-${options.cacheName}` : options.url, {
                    tmpPath: options.tmpPath,
                    batchName: options.batch
                });
                const selected = new Set(options.scrape);
                ctx.allowScrape = {
                    web: selected.has('all') || selected.has('web'),
                    assets: ['all', 'assets', 'img', 'media', 'files'].some(value => selected.has(value))
                };
                ctx.outputName = ctx.fileCache.defaultZipFileName;
                const reportName = ctx.outputName.replace(/\.zip$/, '.report.json');
                ctx.reportFile = {
                    path: options.zip
                        ? resolve(options.outputPath || process.cwd(), reportName)
                        : join(ctx.fileCache.cacheDir, reportName)
                };
                // Each batch stores only its own pages, so it keeps its own source database.
                const database = options.batch > 0 ? `mg-context-batch-${options.batch}.sqlite` : 'mg-context.sqlite';
                ctx.migrateContext = new MigrateContext({dbPath: join(ctx.fileCache.tmpDir, database)});
                await ctx.migrateContext.init();
                ctx.webScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor);
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
                if (options.batch > 0) {
                    task.title += ` batch ${ctx.fileCache.batchName}`;
                }
            }
        },
        {
            title: 'Fetching content',
            task: async (ctx, task) => {
                try {
                    if (!ctx.migrateContext.sources.hasCompletedIngestion || options.rereadSource) {
                        task.output = `Discovering content at ${options.url}`;
                        await ingest(options.url, ctx.migrateContext, {
                            replace: Boolean(options.rereadSource),
                            batch: options.batch,
                            limit: options.limit,
                            cpt: options.cpt,
                            postsBefore: options.postsBefore,
                            postsAfter: options.postsAfter,
                            maxPosts: options.maxPosts,
                            trustSelfSignedCert: options.trustSelfSignedCert,
                            apiUser: ctx.apiUser,
                            usersJSON: ctx.usersJSON,
                            onProgress: title => {
                                task.output = title;
                            }
                        });
                    } else {
                        task.output = 'Reading stored WordPress content';
                    }
                    task.output = null;
                } catch (error) {
                    task.output = error.message;
                    throw error;
                }
            }
        },
        {
            title: 'Map WordPress content',
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
                ctx.summary = await map(options, ctx.migrateContext, {fileCache: ctx.fileCache, ghostUsers: users()});
                task.output = `${ctx.summary.imported} imported, ${ctx.summary.skipped} skipped`;
                if (ctx.summary.skipped > 0 && ctx.summary.imported === 0) {
                    throw new Error('Every selected WordPress item was invalid. See the migration report.');
                }
            }
        },
        {
            title: 'Fetch missing data via WebScraper',
            skip: ctx => !ctx.allowScrape.web,
            task: (ctx, task) => {
                const scrape = async (post, subtask) => {
                    if (post.get('status') === 'draft') {
                        return;
                    }
                    // Fetch failures are optional; setter/processor errors are not.
                    const url = JSON.parse(ctx.migrateContext.sources.get('content', post.lookupKey).content).link;
                    subtask.output = url;
                    let response;
                    try {
                        response = await ctx.webScraper.scrapeUrl(
                            url,
                            scrapeConfig.posts,
                            post.ghostId,
                            options.wait_after_scrape || 100
                        );
                    } catch (error) {
                        if (error.errorType !== 'ScrapeError') throw error;
                        ctx.migrateContext.recordDiagnostic('operation:warning', {
                            operation: 'Web scraping',
                            url,
                            reason: error.message
                        });
                        return;
                    }
                    post.webscrapeData = response.responseData;
                    const processed = postProcessor({...response.responseData}, {html: post.get('html')}, options);
                    for (const [field, value] of Object.entries(processed)) {
                        if (field in post.schema.shape && value !== null && value !== undefined && value !== '') {
                            post.set(field, value);
                        }
                    }
                };
                // One counted sub-task rather than one per post, so memory does not grow with the site.
                return task.newListr(
                    [
                        {
                            title: 'Posts',
                            task: async (_ctx, subtask) => {
                                let processed = 0;
                                const total = ctx.migrateContext.db.stmts.countPosts.get().count;
                                subtask.title = `Posts (${processed}/${total})`;
                                await ctx.migrateContext.forEachPost(
                                    async post => {
                                        await scrape(post, subtask);
                                        subtask.title = `Posts (${++processed}/${total})`;
                                    },
                                    {batchSize: 25}
                                );
                                subtask.output = null;
                            }
                        }
                    ],
                    {concurrent: false, exitOnError: true}
                );
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
                await ctx.migrateContext.writeMigrationReport(ctx.reportFile.path, {
                    ...ctx.summary,
                    warnings: ctx.warningCount,
                    status: 'complete',
                    files: ctx.exportedFiles
                });
                ctx.reportFile.size = (await stat(ctx.reportFile.path)).size;
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

const getTaskRunner = options => {
    if (options.info) {
        return makeTaskRunner(getInfoTaskList(options), {...options, topLevel: true});
    }
    return getFullTaskRunner(options);
};

export default {getInfoTaskList, getTaskRunner};
