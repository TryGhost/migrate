import {createReadStream} from 'node:fs';
import {stat, rename, rm, mkdir, mkdtemp, opendir} from 'node:fs/promises';
import {join, resolve, basename, dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {MigrateContext} from '@tryghost/mg-context';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {ingest, map, applyScrapedData, postUrl} from '@tryghost/mg-substack';
import {slugify} from '@tryghost/string';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {streamGhostUsers, GhostUserFetchError} from '@tryghost/mg-ghost-authors';

const scrapeConfig = {
    posts: {
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
            attr: 'content'
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
            attr: 'content'
        },
        twitter_title: {
            selector: 'meta[name="twitter:title"]',
            attr: 'content'
        },
        twitter_description: {
            selector: 'meta[name="twitter:description"]',
            attr: 'content',
            convert: x => {
                return x.slice(0, 499);
            }
        },
        scripts: {
            listItem: 'script',
            data: {
                content: {
                    how: 'html'
                }
            }
        },
        podcast_audio_src: {
            selector: 'div[class*="player-wrapper-outer"] audio',
            attr: 'src'
        }
    }
};

/** Read the section and post tags, and the ld+json authors, from a scraped post page's scripts. */
const postProcessor = (scrapedData, data, options) => {
    if (scrapedData.scripts) {
        let tags = [];

        scrapedData.scripts.forEach(script => {
            if (script.content.trim().startsWith('window._analyticsConfig')) {
                try {
                    let theContent = script.content.trim();
                    theContent = theContent.replace(/^window\._analyticsConfig[ ]+=[ ]+JSON\.parse\(/, '');
                    theContent = theContent.replace(/\)$/, '');
                    theContent = JSON.parse(JSON.parse(theContent));

                    if (theContent?.properties?.section_slug && theContent?.properties?.section_name) {
                        tags.push({
                            url: `/substack-section/${theContent.properties.section_slug.trim()}`,
                            data: {
                                name: theContent.properties.section_name.trim(),
                                slug: theContent.properties.section_slug.trim()
                            }
                        });
                    }
                } catch (error) {
                    console.log('Error parsing tags', script.content, error); // eslint-disable-line no-console
                }
            } else if (
                /^window\._preloads\s*=\s*JSON\.parse\("/.test(script.content.trim()) ||
                (script.content.trim().startsWith('{') && script.content.includes('"postTags"'))
            ) {
                // Older pages inline the preloads as a JSON string; newer pages load them from a
                // `script#preloads-json` element, whose content is the JSON itself.
                try {
                    let theContent = script.content.trim();
                    if (theContent.startsWith('window._preloads')) {
                        theContent = theContent.replace(/^window\._preloads[ ]+=[ ]+JSON\.parse\(/, '');
                        theContent = theContent.replace(/\)$/, '');
                        theContent = JSON.parse(theContent);
                    }
                    theContent = JSON.parse(theContent);

                    theContent.post.postTags.forEach(tag => {
                        tags.push({
                            url: `/substack-tag/${tag.slug.trim()}`,
                            data: {
                                name: tag.name.trim(),
                                slug: tag.slug.trim()
                            }
                        });
                    });
                } catch (error) {
                    console.log('Error parsing tags', script.content, error); // eslint-disable-line no-console
                }
            } else if (
                options?.useMetaAuthor !== false &&
                (script.content.trim().includes('"@type": "NewsArticle"') ||
                    script.content.trim().includes('"@type":"NewsArticle"'))
            ) {
                try {
                    let theContent = script.content.trim();
                    theContent = JSON.parse(theContent);

                    if (theContent?.author) {
                        const usersArray = [];

                        // Ensure ldJSON.author is an array
                        if (theContent.author && !Array.isArray(theContent.author)) {
                            theContent.author = [theContent.author];
                        }

                        theContent.author.forEach(user => {
                            const userId = user.identifier.replace('user:', '').trim();
                            const userSlug = slugify(
                                user.url
                                    .replace('https://substack.com/@', '')
                                    .replace(`https://substack.com/profile/${userId}-`, '')
                                    .trim()
                            );

                            usersArray.push({
                                url: user.url,
                                data: {
                                    slug: userSlug,
                                    name: user.name.trim(),
                                    email: `${userSlug}@example.com`,
                                    profile_image: user?.image?.contentUrl ?? null
                                }
                            });
                        });

                        scrapedData.authors = usersArray;
                    }
                } catch (error) {
                    console.log('Error parsing authors', script.content, error); // eslint-disable-line no-console
                }
            }
        });

        // If the tags array has a section tag, move it to the top of the array
        if (tags.some(tag => tag.url.includes('/substack-section/'))) {
            tags = tags.sort(a => (a.url.includes('/substack-section/') ? -1 : 1));
        }

        scrapedData.tags = tags;

        delete scrapedData.scripts;
    }

    if (scrapedData?.og_image?.includes('2Ftwitter%2Fsubscribe-card.jpg')) {
        scrapedData.og_image = '';
    }

    if (scrapedData?.twitter_image?.includes('2Ftwitter%2Fsubscribe-card.jpg')) {
        scrapedData.twitter_image = '';
    }

    if (scrapedData?.feature_image?.includes('2Ftwitter%2Fsubscribe-card.jpg')) {
        scrapedData.feature_image = '';
    }

    return scrapedData;
};

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
                // Without --cacheName the workspace is keyed by the export's full path, so exports that share a
                // file name never share stored source data.
                const source = resolve(options.pathToZip);
                ctx.fileCache = new fsUtils.FileCache(
                    options.cacheName
                        ? `substack-${options.cacheName}`
                        : join(dirname(source), `substack-${basename(source)}`),
                    {tmpPath: options.tmpPath}
                );
                const selected = new Set(options.scrape);
                ctx.allowScrape = {
                    web: selected.has('all') || selected.has('web'),
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
                ctx.webScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor);
                if (ctx.allowScrape.assets) {
                    ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                        domains: [
                            'https://cdn.substack.com',
                            'https://substackcdn.com',
                            'https://substack-post-media.s3.amazonaws.com',
                            'https://api.substack.com'
                        ],
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
                        task.output = `Reading ${options.pathToZip}`;
                        await ingest(options.pathToZip, ctx.migrateContext, {replace: Boolean(options.rereadSource)});
                    } else {
                        task.output = 'Reading stored Substack content';
                    }
                    task.output = null;
                } catch (error) {
                    task.output = error.message;
                    throw error;
                }
            }
        },
        {
            title: 'Map Substack content',
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
                    throw new Error('Every selected Substack post was invalid. See the migration report.');
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
                    const url = postUrl(
                        JSON.parse(ctx.migrateContext.sources.get('post', post.lookupKey).content),
                        options.url
                    );
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
                    // The page scripts can be large; the scrape cache keeps them, the post keeps the rest.
                    const {scripts: _scripts, ...stored} = response.responseData;
                    post.webscrapeData = stored;
                    // Section and post tags, and authors, come from the post processor and are set on the post here.
                    const processed = postProcessor({...response.responseData}, {html: post.get('html')}, options);
                    applyScrapedData(post, processed, ctx.migrateContext, options);
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

export {scrapeConfig, postProcessor};
