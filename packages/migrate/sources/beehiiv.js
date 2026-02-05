import {readFileSync} from 'node:fs';
import beehiivIngest from '@tryghost/mg-beehiiv';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlLexical from '@tryghost/mg-html-lexical';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';
import {slugify} from '@tryghost/string';

const scrapeConfig = {
    posts: {
        meta_description: {
            selector: 'meta[name="description"]',
            attr: 'content'
        },
        og_title: {
            selector: 'meta[property="og:title"]',
            attr: 'content'
        },
        og_description: {
            selector: 'meta[property="og:description"]',
            attr: 'content'
        },
        twitter_title: {
            selector: 'meta[property="twitter:title"]',
            attr: 'content'
        },
        twitter_description: {
            selector: 'meta[property="twitter:description"]',
            attr: 'content'
        },
        authors: {
            // We cannot rely on tags being available as HTML elements because of gating. They are available
            // as JSON, but the script tag they're in has no ID, so we need to look at all script tags, and
            // only process the tag that contains `window.__remixContext`.
            listItem: 'script',
            data: {
                authors: {
                    how: 'html',
                    convert: (x) => {
                        if (x && x.includes('window.__remixContext')) {
                            let theAuthors = [];

                            let remixContent = x.replace('window.__remixContext =', '');
                            remixContent = remixContent.replace(/;$/, '');

                            const parsed = JSON.parse(remixContent);

                            const parsedAuthors = parsed.state.loaderData['routes/p/$slug'].post.authors;

                            parsedAuthors.forEach((person) => {
                                theAuthors.push(person.name);
                            });

                            return theAuthors;
                        } else {
                            return;
                        }
                    }
                }
            }
        }
    }
};

const postProcessor = (scrapedData, data, options) => { // eslint-disable-line no-unused-vars
    if (scrapedData.authors && scrapedData.authors.length > 0) {
        let realAuthors = [];

        scrapedData.authors.forEach((block) => {
            if (!block.authors) {
                return;
            }

            block.authors.forEach((author) => {
                const authorSlug = slugify(author);
                const authorEmail = `${authorSlug}@example.com`;

                realAuthors.push({
                    data: {
                        slug: authorSlug,
                        name: author,
                        email: authorEmail
                    }
                });
            });
        });

        delete scrapedData.author;
        scrapedData.authors = realAuthors;
    } else {
        const defaultAuthorName = options.defaultAuthorName ?? 'Author';
        const defaultAuthorSlug = slugify(defaultAuthorName);
        const defaultAuthorEmail = `${defaultAuthorSlug}@example.com`;

        scrapedData.authors = [{
            data: {
                slug: defaultAuthorSlug,
                name: defaultAuthorName,
                email: defaultAuthorEmail
            }
        }];
    }

    return scrapedData;
};

const skipScrape = (post) => {
    return post.data.status === 'draft' || post.url === '';
};

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

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(ctx.options.url);
            ctx.fileCache = new fsUtils.FileCache(`beehiiv-${ctx.options.cacheName}`, {
                tmpPath: ctx.options.tmpPath
            });
            ctx.webScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor, skipScrape);
            ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                domains: [
                    'http://media.beehiiv.com',
                    'https://media.beehiiv.com'
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
            title: 'Read beehiiv content',
            task: async (ctx) => {
                try {
                    ctx.result = await beehiivIngest({
                        options
                    });
                    await ctx.fileCache.writeTmpFile(ctx.result, 'beehiiv-export-data.json');
                } catch (error) {
                    ctx.errors.push('Failed to read beehiiv content', error); // eslint-disable-line no-console
                    throw error;
                }
            }
        },
        {
            title: 'Fetch missing data via WebScraper',
            skip: ctx => !ctx.allowScrape.web,
            task: (ctx) => {
                // 2. Pass the results through the web scraper to get any missing data
                let tasks = ctx.webScraper.hydrate(ctx); // eslint-disable-line no-shadow
                return makeTaskRunner(tasks, options);
            }
        },
        {
            title: 'Build Link Map',
            task: async (ctx) => {
                // 4. Create a map of all known links for use later
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
                // 5. Format the data as a valid Ghost JSON file
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
                // 6. Format the data as a valid Ghost JSON file
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
                // 7. Process the content looking for known links, and update them to new links
                let tasks = ctx.linkFixer.fix(ctx, task);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            title: 'Convert HTML -> Lexical',
            task: (ctx) => {
                // 8. Convert post HTML -> Lexical
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
                // 9. Write a valid Ghost import zip
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
                // 10. Write a valid Ghost import zip
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
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-beehiiv-${ctx.options.cacheName}.zip`});
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
