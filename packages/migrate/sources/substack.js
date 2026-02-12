import {readFileSync} from 'node:fs';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlLexical from '@tryghost/mg-html-lexical';
import MgWebScraper from '@tryghost/mg-webscraper';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import zipIngest from '@tryghost/mg-substack';
import {slugify} from '@tryghost/string';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {createGhostUserTasks} from '@tryghost/mg-ghost-authors';
import prettyMilliseconds from 'pretty-ms';

const scrapeConfig = {
    posts: {
        meta_title: {
            selector: 'title'
        },
        meta_description: {
            selector: 'meta[name="description"]',
            attr: 'content',
            convert: (x) => {
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
            convert: (x) => {
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
            convert: (x) => {
                return x.slice(0, 499);
            }
        },
        authors: {
            selector: 'script[type="application/ld+json"]',
            convert: (x) => {
                if (!x) {
                    return;
                }

                let ldJSON = JSON.parse(x);
                let theAuthors = [];

                // Ensure ldJSON.author is an array
                if (ldJSON.author && !Array.isArray(ldJSON.author)) {
                    ldJSON.author = [ldJSON.author];
                }

                ldJSON.author.forEach((person) => {
                    const personNameSlug = slugify(person.name);
                    theAuthors.push({
                        url: slugify(person.url),
                        data: {
                            name: person.name,
                            slug: personNameSlug,
                            email: `${personNameSlug}@example.com`
                        }
                    });
                });

                return theAuthors;
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

const postProcessor = (scrapedData, data, options) => {
    if (options?.useMetaAuthor && scrapedData.authors) {
        let usersArray = [];

        scrapedData.authors.forEach((user) => {
            usersArray.push({
                data: {
                    slug: user.data.slug,
                    name: `${user.data.name}`,
                    email: user.data.email
                }
            });
        });

        scrapedData.authors = usersArray;
    }

    if (scrapedData.scripts) {
        let tags = [];

        scrapedData.scripts.forEach((script) => {
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
            } else if (script.content.trim().startsWith('window._preloads')) {
                try {
                    let theContent = script.content.trim();
                    theContent = theContent.replace(/^window\._preloads[ ]+=[ ]+JSON\.parse\(/, '');
                    theContent = theContent.replace(/\)$/, '');
                    theContent = JSON.parse(JSON.parse(theContent));

                    theContent.post.postTags.forEach((tag) => {
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
            }
        });

        scrapedData.tags = tags;

        // If the tags array has a section tag, move it to the top of the array
        if (tags.some(tag => tag.url.includes('/substack-section/'))) {
            tags = tags.sort((a, b) => { // eslint-disable-line no-unused-vars
                return a.url.includes('/substack-section/') ? -1 : 1;
            });
        }

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

const skipScrape = (post) => {
    return post.data.status === 'draft';
};

/**
 * getTasks: Steps to Migrate from Medium
 *
 * Wiring of the steps to migrate from medium.
 *
 * @param {Object} options
 */
const getTaskRunner = (options) => {
    let runnerTasks = [
        {
            title: 'Initializing',
            task: async (ctx, task) => {
                ctx.options = options;

                ctx.allowScrape = {
                    all: ctx.options.scrape.includes('all'),
                    assets: ctx.options.scrape.includes('all') || ctx.options.scrape.includes('assets') || ctx.options.scrape.includes('img') || ctx.options.scrape.includes('media') || ctx.options.scrape.includes('files'),
                    web: ctx.options.scrape.includes('web') || ctx.options.scrape.includes('all')
                };

                // Delete the authors meta field if the option is not enabled (this data is fetched regardless of options passed)
                if (!options.useMetaAuthor) {
                    delete scrapeConfig.posts.authors;
                }

                // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
                ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(options.pathToZip);
                ctx.fileCache = new fsUtils.FileCache(`substack-${ctx.options.cacheName}`, {
                    tmpPath: ctx.options.tmpPath
                });
                ctx.webScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor, skipScrape);
                ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                    allowAllDomains: true
                }, ctx);
                await ctx.assetScraper.init();
                ctx.linkFixer = new MgLinkFixer();

                task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
            }
        },
        {
            title: 'Read csv file',
            task: async (ctx) => {
                // 1. Read the csv file
                try {
                    ctx.result = await zipIngest.ingest(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'zip-export-mapped.json');
                } catch (error) {
                    ctx.errors.push({message: 'Failed to read CSV', error});
                    throw error;
                }
            }
        },
        ...createGhostUserTasks(options),
        {
            title: 'Fetch missing data via WebScraper',
            skip: ctx => !ctx.allowScrape.web,
            task: (ctx) => {
                // 2. Pass the results through the web scraper to get any missing data
                let tasks = ctx.webScraper.hydrate(ctx);

                let webScraperOptions = options;
                webScraperOptions.concurrent = 1;
                return makeTaskRunner(tasks, webScraperOptions);
            }
        },
        {
            title: 'Process content',
            task: async (ctx) => {
                // 3. Pass the results through the processor to change the HTML structure
                try {
                    ctx.result = await zipIngest.process(ctx.result, ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'csv-export-data.json');
                } catch (error) {
                    ctx.errors.push({message: 'Failed to process content', error});
                    throw error;
                }
            }
        },
        {
            title: 'Build Link Map',
            task: async (ctx) => {
                // 4. Create a map of all known links for use later
                try {
                    ctx.linkFixer.buildMap(ctx);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to build link map', error});
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
                    ctx.errors.push({message: 'Failed to format data as Ghost JSON', error});
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
                let tasks = ctx.linkFixer.fix(ctx, task); // eslint-disable-line no-shadow
                return makeTaskRunner(tasks, options);
            }
        },
        {
            // @TODO don't duplicate this with the utils json file
            title: 'Convert HTML -> Lexical',
            task: (ctx) => {
                // 8. Convert post HTML -> Lexical
                try {
                    let tasks = mgHtmlLexical.convert(ctx); // eslint-disable-line no-shadow
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to convert HTML to Lexical', error});
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
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-substack-${ctx.options.cacheName}.zip`});
                        // now that the file is uploaded to the storage, delete the local zip file
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
            title: 'Clearing cached files',
            enabled: () => !options.cache && options.zip,
            task: async (ctx) => {
                try {
                    await ctx.fileCache.emptyCurrentCacheDir();
                } catch (error) {
                    ctx.errors.push('Failed to clear cache', error);
                    throw error;
                }
            }
        }
    ];

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(runnerTasks, Object.assign({topLevel: true}, options));
};

export default {
    getTaskRunner
};

export {
    scrapeConfig,
    postProcessor,
    skipScrape
};
