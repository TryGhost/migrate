import {readFileSync} from 'node:fs';
import wixCSVIngest from '@tryghost/mg-wix-csv';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlLexical from '@tryghost/mg-html-lexical';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {createGhostUserTasks} from '@tryghost/mg-ghost-authors';
import prettyMilliseconds from 'pretty-ms';

// Small dependency seam so source initialization can be tested without real cache/scraper setup.
const dependencies = {
    AssetScraper: MgAssetScraper,
    FileCache: fsUtils.FileCache,
    LinkFixer: MgLinkFixer
};

const initialize = options => {
    return {
        title: 'Initializing Workspace',
        task: async (ctx, task) => {
            ctx.options = options;
            ctx.allowScrape = {
                assets:
                    ctx.options.scrape.includes('assets') ||
                    ctx.options.scrape.includes('img') ||
                    ctx.options.scrape.includes('media') ||
                    ctx.options.scrape.includes('files')
            };

            ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(ctx.options.url);
            ctx.fileCache = new dependencies.FileCache(`wix-csv-${ctx.options.cacheName}`, {
                tmpPath: ctx.options.tmpPath
            });
            ctx.assetScraper = new dependencies.AssetScraper(
                ctx.fileCache,
                {
                    domains: ['http://static\\.wixstatic\\.com', 'https://static\\.wixstatic\\.com']
                },
                ctx
            );
            await ctx.assetScraper.init();
            ctx.linkFixer = new dependencies.LinkFixer();

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
        }
    };
};

const getFullTaskList = options => {
    return [
        initialize(options),
        {
            title: 'Read Wix CSV content',
            task: async ctx => {
                try {
                    ctx.result = await wixCSVIngest({
                        options
                    });
                    await ctx.fileCache.writeTmpFile(ctx.result, 'wix-csv-export-data.json');
                } catch (error) {
                    ctx.errors.push('Failed to read Wix CSV content', error); // eslint-disable-line no-console
                    throw error;
                }
            }
        },
        ...createGhostUserTasks(options),
        {
            title: 'Build Link Map',
            task: async ctx => {
                try {
                    ctx.linkFixer.buildMap(ctx);
                } catch (error) {
                    ctx.errors.push('Failed to build link map', error); // eslint-disable-line no-console
                    throw error;
                }
            }
        },
        {
            title: 'Format data as Ghost JSON',
            task: async ctx => {
                try {
                    ctx.result = await toGhostJSON(ctx.result, ctx.options, ctx);
                } catch (error) {
                    ctx.errors.push('Failed to format data as Ghost JSON', error); // eslint-disable-line no-console
                    throw error;
                }
            }
        },
        {
            title: 'Fetch images via AssetScraper',
            skip: ctx => !ctx.allowScrape.assets,
            task: async ctx => {
                const tasks = ctx.assetScraper.getTasks();
                return makeTaskRunner(tasks, {
                    verbose: options.verbose,
                    exitOnError: false,
                    concurrent: false
                });
            }
        },
        {
            title: 'Update links in content via LinkFixer',
            task: async (ctx, task) => {
                const tasks = ctx.linkFixer.fix(ctx, task);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            title: 'Convert HTML -> Lexical',
            task: ctx => {
                try {
                    const tasks = mgHtmlLexical.convert(ctx);
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push('Failed to convert HTML -> Lexical', error); // eslint-disable-line no-console
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import JSON File',
            task: async ctx => {
                try {
                    await ctx.fileCache.writeGhostImportFile(ctx.result);
                } catch (error) {
                    ctx.errors.push('Failed to write Ghost import JSON File', error); // eslint-disable-line no-console
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
                    const timer = Date.now();
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
                            fileName: `gh-wix-csv-${ctx.options.cacheName}.zip`
                        });
                        await fsUtils.zip.deleteFile(localFilePath);
                    }

                    task.output = `Successfully written zip to ${ctx.outputFile.path} in ${prettyMilliseconds(Date.now() - timer)}`;
                } catch (error) {
                    ctx.errors.push('Failed to write and upload ZIP file', error); // eslint-disable-line no-console
                    throw error;
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
                    ctx.errors.push('Failed to clear temporary cached files', error);
                    throw error;
                }
            }
        }
    ];
};

const getTaskRunner = options => {
    const tasks = getFullTaskList(options);
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};

export default {
    dependencies,
    initialize,
    getFullTaskList,
    getTaskRunner
};
