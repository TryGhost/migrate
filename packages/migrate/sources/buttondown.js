import {readFileSync} from 'node:fs';
import buttondownIngest from '@tryghost/mg-buttondown';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlLexical from '@tryghost/mg-html-lexical';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const initialize = (options) => {
    return {
        title: 'Initializing Workspace',
        task: async (ctx, task) => {
            ctx.options = options;
            ctx.allowScrape = {
                all: ctx.options.scrape.includes('all'),
                assets: ctx.options.scrape.includes('all') || ctx.options.scrape.includes('assets') || ctx.options.scrape.includes('img') || ctx.options.scrape.includes('media') || ctx.options.scrape.includes('files'),
                web: ctx.options.scrape.includes('web') || ctx.options.scrape.includes('all')
            };

            ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(ctx.options.url);
            ctx.fileCache = new fsUtils.FileCache(`buttondown-${ctx.options.cacheName}`, {
                tmpPath: ctx.options.tmpPath
            });
            ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                domains: [
                    'https://assets.buttondown.email',
                    'https://buttondown-attachments.s3.amazonaws.com'
                ]
            }, ctx);
            await ctx.assetScraper.init();
            ctx.linkFixer = new MgLinkFixer();

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
        }
    };
};

const getFullTaskList = (options) => {
    return [
        initialize(options),
        {
            title: 'Read Buttondown content',
            task: async (ctx) => {
                try {
                    ctx.result = await buttondownIngest({
                        options
                    });
                    await ctx.fileCache.writeTmpFile(ctx.result, 'buttondown-export-data.json');
                } catch (error) {
                    ctx.errors.push('Failed to read Buttondown content', error); // eslint-disable-line no-console
                    throw error;
                }
            }
        },
        {
            title: 'Build Link Map',
            task: async (ctx) => {
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
            task: async (ctx) => {
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
            task: async (ctx) => {
                let tasks = ctx.assetScraper.getTasks();
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
                let tasks = ctx.linkFixer.fix(ctx, task);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            title: 'Convert HTML -> Lexical',
            task: (ctx) => {
                try {
                    let tasks = mgHtmlLexical.convert(ctx);
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push('Failed to convert HTML -> Lexical', error); // eslint-disable-line no-console
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import JSON File',
            task: async (ctx) => {
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
                    let timer = Date.now();
                    const zipFinalPath = options.outputPath || process.cwd();
                    // zip the file and save it temporarily
                    ctx.outputFile = await fsUtils.zip.write(zipFinalPath, ctx.fileCache.zipDir, ctx.fileCache.defaultZipFileName);

                    if (isStorage) {
                        const storage = options.outputStorage;
                        const localFilePath = ctx.outputFile.path;

                        // read the file buffer
                        const fileBuffer = await readFileSync(ctx.outputFile.path);
                        // Upload the file to the storage
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-buttondown-${ctx.options.cacheName}.zip`});
                        // now that the file is uploaded to the storage, delete the local zip file
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
            task: async (ctx) => {
                try {
                    await ctx.fileCache.emptyCurrentCacheDir();
                } catch (error) {
                    ctx.errors.push('Failed to clear temporary cached files', error); // eslint-disable-line no-console
                    throw error;
                }
            }
        }
    ];
};

const getTaskRunner = (options) => {
    let tasks = [];

    tasks = getFullTaskList(options);

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};

export default {
    initialize,
    getFullTaskList,
    getTaskRunner
};
