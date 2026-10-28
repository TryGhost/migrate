import {basename} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';
import type {ImageCache} from './types.js';

interface ZipEntry {
    path: string;
    isDirectory: boolean;
    size: number;
    read(): Promise<Buffer>;
}

// A Curated export holds each published issue as `data-export/issues/published/<number>/<number>.json`, beside the
// issue's images. Entries are matched by their full path, so the export may sit inside a top-level directory.
const ISSUE_FILE = /(?:^|\/)data-export\/issues\/(published\/(\d{1,10})\/([^/]+))$/;
const ISSUE_JSON = /^\d{1,10}\.json$/;
const IMAGE = /\.(?:jpe?g|png|gif|svgz?|webp)$/i;
// Curated also exports resized copies of each image; only the original is imported.
const RESIZED = ['square_thumb', 'original_ratio_extra_large', 'original_ratio_medium'];

/** An issue or image file in the export, keyed by its path below `data-export/issues/`. */
interface ExportFile {
    kind: 'issue' | 'image';
    key: string;
    /** The issue number from the file's directory. */
    issue: string;
    name: string;
    entry: ZipEntry;
}

function exportFile(entry: ZipEntry): ExportFile | null {
    const match = entry.isDirectory ? null : entry.path.match(ISSUE_FILE);
    if (!match) {
        return null;
    }
    const [, key, issue, name] = match;
    if (ISSUE_JSON.test(name)) {
        return {kind: 'issue', key, issue, name, entry};
    }
    if (IMAGE.test(name) && !RESIZED.some(prefix => name.includes(prefix))) {
        return {kind: 'image', key, issue, name, entry};
    }
    return null;
}

/** The export's issue and image files, one at a time. Rejects an export without published issues. */
async function* exportFiles(pathToZip: string): AsyncGenerator<ExportFile> {
    let issues = 0;
    for await (const entry of fsUtils.zip.entries(pathToZip, {filter: (item: ZipEntry) => exportFile(item) !== null})) {
        const file = exportFile(entry)!;
        if (file.kind === 'issue') {
            issues += 1;
        }
        yield file;
    }
    if (!issues) {
        throw new Error(
            `${pathToZip}: No published Curated issues found (expected data-export/issues/published/<number>/<number>.json)`
        );
    }
}

async function issueRecord(pathToZip: string, file: ExportFile): Promise<SourceRecordInput> {
    const text = (await file.entry.read()).toString('utf8');
    let issue: unknown;
    try {
        issue = JSON.parse(text);
    } catch (error) {
        throw new Error(`${pathToZip}: ${file.entry.path} is not valid JSON (${(error as Error).message})`);
    }
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
        throw new Error(`${pathToZip}: ${file.entry.path} is not a Curated issue`);
    }
    return {
        kind: 'issue',
        key: file.key,
        content: JSON.stringify(issue),
        format: 'json',
        metadata: {file: file.entry.path}
    };
}

function imageRecord(file: ExportFile, outputPath?: string): SourceRecordInput {
    return {
        kind: 'image',
        key: file.key,
        content: JSON.stringify({file: file.entry.path, size: file.entry.size}),
        format: 'json',
        metadata: outputPath ? {file: file.entry.path, outputPath} : {file: file.entry.path}
    };
}

/**
 * Yield the export's originals one at a time without storing them: each published issue's JSON as an `issue`
 * record, and each original image beside it as an `image` record naming the file, both keyed by their path below
 * `data-export/issues/`, such as `published/12/12.json`. Resized image copies and other files are not read. Rejects
 * an export without published issues, or with an issue file that is not a JSON object.
 */
export async function* parse(pathToZip: string): AsyncGenerator<SourceRecordInput> {
    for await (const file of exportFiles(pathToZip)) {
        yield file.kind === 'issue' ? await issueRecord(pathToZip, file) : imageRecord(file);
    }
}

/**
 * Read a Curated export zip into `context.sources`, writing each original image into `fileCache` (an optimized copy
 * and the `_o` original) as it goes. Each `image` record's metadata holds the `outputPath` its file was written to.
 * A path that appears twice keeps its first record and reports a `source:conflict`. Explicit `replace: true` is
 * required when completed source data exists; a failed read keeps the previous data.
 */
export async function ingest(
    pathToZip: string,
    context: MigrateContext,
    {replace = false, fileCache}: {replace?: boolean; fileCache: ImageCache}
): Promise<void> {
    if (!fileCache) {
        throw new Error('Curated ingestion needs a fileCache to write the export images into.');
    }
    await context.sources.ingest({replace, metadata: {adapter: 'curated', file: basename(pathToZip)}}, async stage => {
        for await (const file of exportFiles(pathToZip)) {
            if (file.kind === 'issue') {
                stage.reconcile(await issueRecord(pathToZip, file));
                continue;
            }
            const image = fileCache.resolveImageFileName(`${file.issue}/${file.name}`);
            const {previous} = stage.reconcile(imageRecord(file, image.outputPath));
            if (!previous) {
                await fileCache.writeContentFile(await file.entry.read(), {...image, optimize: true});
            }
        }
    });
}
