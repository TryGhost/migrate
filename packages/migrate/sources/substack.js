import {readFileSync, existsSync} from 'node:fs';
import {mkdir, writeFile, rm} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {execFile as execFileCb, spawn} from 'node:child_process';
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

        let substackSubdomain = null;

        for (const script of scrapedData.scripts) {
            if (script.content.trim().startsWith('window._analyticsConfig')) {
                try {
                    let raw = script.content.trim();
                    raw = raw.replace(/^window\._analyticsConfig[ ]+=[ ]+JSON\.parse\(/, '');
                    raw = raw.replace(/\)$/, '');
                    const parsed = JSON.parse(JSON.parse(raw));
                    if (parsed?.properties?.subdomain) {
                        substackSubdomain = parsed.properties.subdomain.trim();
                    }
                } catch (_) {
                    // subdomain extraction is best-effort
                }
                break;
            }
        }

        scrapedData.scripts.forEach((script) => {
            if (script.content.trim().startsWith('window._analyticsConfig')) {
                try {
                    let theContent = script.content.trim();
                    theContent = theContent.replace(/^window\._analyticsConfig[ ]+=[ ]+JSON\.parse\(/, '');
                    theContent = theContent.replace(/\)$/, '');
                    theContent = JSON.parse(JSON.parse(theContent));

                    if (theContent?.properties?.subdomain) {
                        substackSubdomain = theContent.properties.subdomain.trim();
                    }

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

                    const videoUpload = theContent.post?.videoUpload;
                    const videoUploadId = videoUpload?.id || theContent.post?.video_upload_id;
                    if (videoUploadId && theContent.post?.canonical_url) {
                        const origin = new URL(theContent.post.canonical_url).origin;
                        scrapedData.video_upload_src = `${origin}/api/v1/video/upload/${videoUploadId}/src?type=mp4`;
                        if (videoUpload?.mux_playback_id) {
                            scrapedData.mux_playback_id = videoUpload.mux_playback_id;
                        }
                    }
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

const execFileAsync = (cmd, args) => {
    return new Promise((resolve, reject) => {
        execFileCb(cmd, args, (error, stdout) => {
            if (error) {
                return reject(error);
            }
            resolve(stdout);
        });
    });
};

const checkFfmpeg = async () => {
    try {
        await execFileAsync('ffmpeg', ['-version']);
    } catch {
        throw new Error('ffmpeg is required for --videoPodcasts but was not found in PATH');
    }
};

const buildCookieHeader = (cookie) => {
    if (!cookie) {
        return undefined;
    }
    if (cookie.includes('=')) {
        return cookie;
    }
    return `substack.sid=${cookie}; connect.sid=${cookie}`;
};

const spawnFfmpeg = (args) => {
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', args, {stdio: ['ignore', 'pipe', 'pipe']});

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`ffmpeg exited with code ${code}`));
            }
        });

        proc.on('error', reject);
    });
};

const parseM3u8 = (text, baseUrl) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const resolveUrl = (url) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        const base = new URL(baseUrl);
        base.pathname = base.pathname.replace(/[^/]*$/, '') + url;
        return base.toString();
    };

    const isMaster = lines.some(l => l.startsWith('#EXT-X-STREAM-INF'));
    if (isMaster) {
        let bestBandwidth = -1;
        let bestUrl = null;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/#EXT-X-STREAM-INF:.*BANDWIDTH=(\d+)/);
            if (match) {
                const bw = parseInt(match[1], 10);
                const url = lines[i + 1];
                if (bw > bestBandwidth && url && !url.startsWith('#')) {
                    bestBandwidth = bw;
                    bestUrl = resolveUrl(url);
                }
            }
        }

        return {type: 'master', bestRenditionUrl: bestUrl};
    }

    const segments = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXTINF')) {
            const url = lines[i + 1];
            if (url && !url.startsWith('#')) {
                segments.push(resolveUrl(url));
            }
        }
    }

    return {type: 'media', segments};
};

const fetchM3u8Segments = async (hlsUrl) => {
    const res = await fetch(hlsUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch m3u8 playlist: ${res.status}`);
    }
    const text = await res.text();
    const parsed = parseM3u8(text, hlsUrl);

    if (parsed.type === 'master') {
        if (!parsed.bestRenditionUrl) {
            throw new Error('No renditions found in master playlist');
        }
        const mediaRes = await fetch(parsed.bestRenditionUrl);
        if (!mediaRes.ok) {
            throw new Error(`Failed to fetch media playlist: ${mediaRes.status}`);
        }
        const mediaText = await mediaRes.text();
        const mediaParsed = parseM3u8(mediaText, parsed.bestRenditionUrl);
        return mediaParsed.segments;
    }

    return parsed.segments;
};

const fetchSegment = async (url, onThrottle, retries = 3) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const res = await fetch(url);

        if (res.status === 429 || res.status === 503) {
            const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
            const backoff = retryAfter > 0
                ? retryAfter * 1000
                : Math.min(1000 * Math.pow(2, attempt), 30_000);
            onThrottle?.(res.status, Math.round(backoff / 1000));
            await new Promise(r => setTimeout(r, backoff));
            continue;
        }

        if (!res.ok) {
            throw new Error(`Segment failed: ${res.status}`);
        }
        return Buffer.from(await res.arrayBuffer());
    }
    throw new Error(`Segment failed after ${retries} retries (rate limited)`);
};

const downloadSegments = async (segmentUrls, tmpDir, concurrency, onProgress) => {
    let completed = 0;
    let throttleCount = 0;
    const total = segmentUrls.length;
    let index = 0;

    const onThrottle = (status, delaySec) => {
        throttleCount++;
        onProgress?.(completed, total, `${status} throttled, waiting ${delaySec}s (${throttleCount} retries)`);
    };

    const worker = async () => {
        while (index < total) {
            const i = index++;
            const segPath = join(tmpDir, `seg-${String(i).padStart(6, '0')}.ts`);

            if (existsSync(segPath)) {
                completed++;
                onProgress?.(completed, total, null);
                continue;
            }

            const buffer = await fetchSegment(segmentUrls[i], onThrottle);
            await writeFile(segPath, buffer);
            completed++;
            onProgress?.(completed, total, null);
        }
    };

    await Promise.all(Array.from({length: Math.min(concurrency, total)}, () => worker()));
};

const downloadVideoPodcast = async (videoUploadSrc, muxPlaybackId, slug, fileCache, cookie, concurrency, onProgress) => {
    if (!muxPlaybackId) {
        throw new Error('No mux_playback_id available for HLS download');
    }

    const resolved = fileCache.resolveMediaFileName(`${slug}.mp4`);
    if (existsSync(resolved.storagePath)) {
        return resolved.outputPath;
    }

    onProgress?.(0, 0, 'fetching video token…');

    const fetchOptions = {redirect: 'manual'};
    const cookieHeader = buildCookieHeader(cookie);
    if (cookieHeader) {
        fetchOptions.headers = {cookie: cookieHeader};
    }

    let redirectUrl = null;
    for (let attempt = 0; attempt <= 5; attempt++) {
        const response = await fetch(videoUploadSrc, fetchOptions);

        if (response.status === 429 || response.status === 503) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
            const backoff = retryAfter > 0
                ? retryAfter * 1000
                : Math.min(2000 * Math.pow(2, attempt), 60_000);
            onProgress?.(0, 0, `token API rate limited (${response.status}), retrying in ${Math.round(backoff / 1000)}s…`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
        }

        redirectUrl = response.headers.get('location');

        if (!redirectUrl) {
            throw new Error(`No redirect from video API (status ${response.status})`);
        }
        break;
    }

    if (!redirectUrl) {
        throw new Error('Video token API rate limited after 6 attempts');
    }

    const redirectParsed = new URL(redirectUrl);
    const token = redirectParsed.searchParams.get('token');

    if (!token) {
        throw new Error(`Could not extract Mux token from redirect URL: ${redirectUrl}`);
    }

    onProgress?.(0, 0, 'fetching playlist…');

    const hlsUrl = `https://stream.mux.com/${muxPlaybackId}.m3u8?token=${token}`;
    const segmentUrls = await fetchM3u8Segments(hlsUrl);

    if (segmentUrls.length === 0) {
        throw new Error('No segments found in HLS playlist');
    }

    const tmpDir = join(fileCache.tmpDir, `hls-${slug}`);
    await mkdir(tmpDir, {recursive: true});
    await mkdir(dirname(resolved.storagePath), {recursive: true});

    await downloadSegments(segmentUrls, tmpDir, concurrency, onProgress);

    const concatList = segmentUrls.map((_, i) =>
        `file '${join(tmpDir, `seg-${String(i).padStart(6, '0')}.ts`)}'`
    ).join('\n');
    await writeFile(join(tmpDir, 'concat.txt'), concatList);

    await spawnFfmpeg([
        '-f', 'concat', '-safe', '0',
        '-i', join(tmpDir, 'concat.txt'),
        '-c', 'copy', '-movflags', '+faststart',
        '-y', resolved.storagePath
    ]);

    await rm(tmpDir, {recursive: true, force: true});

    return resolved.outputPath;
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
                let assetDomains = [
                    'https://cdn.substack.com',
                    'https://substackcdn.com',
                    'https://substack-post-media.s3.amazonaws.com',
                    'https://api.substack.com'
                ];

                if (options.url) {
                    assetDomains.push(options.url);
                }

                ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                    domains: assetDomains
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
            title: 'Download video podcasts',
            skip: () => !options.videoPodcasts,
            task: async (ctx, task) => {
                await checkFfmpeg();

                const videoPosts = ctx.result.posts.filter(p => p.data?.video_upload_src);
                if (videoPosts.length === 0) {
                    task.output = 'No video podcasts found';
                    return;
                }

                let downloaded = 0;
                let failed = 0;
                let cached = 0;

                const summary = () => {
                    const parts = [];
                    if (downloaded) parts.push(`${downloaded} done`);
                    if (cached) parts.push(`${cached} cached`);
                    if (failed) parts.push(`${failed} failed`);
                    return parts.length ? ` (${parts.join(', ')})` : '';
                };

                for (let i = 0; i < videoPosts.length; i++) {
                    const post = videoPosts[i];
                    const label = `[${i + 1}/${videoPosts.length}]${summary()} ${post.data.slug}`;

                    const resolved = ctx.fileCache.resolveMediaFileName(`${post.data.slug}.mp4`);
                    if (existsSync(resolved.storagePath)) {
                        post.data.video_upload_src = resolved.outputPath;
                        cached++;
                        task.output = `${label}: cached`;
                        continue;
                    }

                    task.output = `${label}: fetching video token…`;

                    try {
                        const localPath = await downloadVideoPodcast(
                            post.data.video_upload_src,
                            post.data.mux_playback_id,
                            post.data.slug,
                            ctx.fileCache,
                            options.cookie,
                            options.videoConc || 10,
                            (completed, total, status) => {
                                if (total === 0 && status) {
                                    task.output = `${label}: ${status}`;
                                    return;
                                }
                                const pct = Math.round((completed / total) * 100);
                                const info = status ? ` | ${status}` : '';
                                task.output = `${label}: ${completed}/${total} segments (${pct}%)${info}`;
                            }
                        );
                        post.data.video_upload_src = localPath;
                        downloaded++;
                        task.output = `${label}: done`;
                    } catch (err) {
                        failed++;
                        const hint = options.cookie ? '' : ' If this is paywalled content, re-run with --cookie <substack.sid>';
                        ctx.errors.push({
                            message: `Failed to download video for ${post.data.slug}: ${err.message}.${hint}`,
                            error: err
                        });
                        task.output = `${label}: failed – ${err.message}`;
                    }
                }

                task.output = `Complete:${summary()}`;
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
    skipScrape,
    downloadVideoPodcast,
    buildCookieHeader,
    parseM3u8
};
