import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {createAssetCacheDatabase, resetAssetCacheDatabase} from './asset-cache-database.js';
import type {AssetCacheDatabase} from './asset-cache-database.js';
import type {FileCache, AssetCacheEntry} from './types.js';

interface AssetAttributes {
    id?: number;
    src: string;
    status?: number;
    localPath?: string;
    skip?: string;
}

export default class AssetCache {
    #database: AssetCacheDatabase;
    #fileCache: FileCache;

    constructor({fileCache}: {fileCache: FileCache}) {
        this.#fileCache = fileCache;

        const theCachePath = join(this.#fileCache.tmpDir, 'assets-cache');
        mkdirSync(theCachePath, {recursive: true});

        this.#database = createAssetCacheDatabase(join(theCachePath, 'assets.db'));
    }

    init(): void {
        // No-op: schema is created in the constructor.
        // Kept for API compatibility with AssetScraper.
    }

    add(src: string): AssetCacheEntry {
        const existing = this.#database.stmts.findBySrc.get(src) as any;

        if (existing) {
            return existing;
        }

        const result = this.#database.stmts.insertAsset.run(src);
        return this.#database.stmts.findById.get(Number(result.lastInsertRowid)) as any;
    }

    update(id: number, key: keyof AssetAttributes, value: string | number): void {
        switch (key) {
        case 'status':
            this.#database.stmts.updateStatus.run(value, id);
            break;
        case 'localPath':
            this.#database.stmts.updateLocalPath.run(value, id);
            break;
        case 'skip':
            this.#database.stmts.updateSkip.run(value, id);
            break;
        default:
            throw new Error(`Cannot update field: ${key}`);
        }
    }

    getAll(): AssetCacheEntry[] {
        return this.#database.stmts.findAll.all() as any[];
    }

    findBySrc(src: string): AssetCacheEntry | null {
        return (this.#database.stmts.findBySrc.get(src) as any) ?? null;
    }

    /**
     * Used in tests, not intended for general use
     */
    _reset(): void {
        /* c8 ignore next 3 */
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('This method is only for use in tests');
        }

        resetAssetCacheDatabase(this.#database);
    }
}
