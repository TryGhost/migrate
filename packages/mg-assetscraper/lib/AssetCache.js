import path from 'node:path';
import fs from 'fs-extra';
import {slugify} from '@tryghost/string';

const remove = (array, iteratee) => {
    const toRemove = [];
    const result = array.filter((item, i) => iteratee(item) && toRemove.push(i));
    toRemove.reverse().forEach(i => array.splice(i, 1));
    return result;
};

class AssetCache {
    /**
     * @param {FileCache} fileCache
     */
    constructor(fileCache) {
        this.fileCache = fileCache;

        // The array that's used in AssetScraper
        this._cache = [];

        // Ensure `/assets/` exists
        fs.ensureDirSync(`${this.fileCache.tmpDir}/assets/`);
    }

    /**
     * @private
     * Get the filename + relative path for asset cache JSON file
     * @param {String} assetUrl The file name
     * @returns {String} The slugified url with the folder prefix
     * @exmaple
     * _assetFileCacheName('https://ghost.org');
     * => 'assets/https-ghost-org'
     */
    _assetFileCacheName(assetUrl) {
        return `assets/${slugify(assetUrl)}`;
    }

    /**
     * Add an item to the asset cache list
     * @param {Object} obj Asset cache object
     */
    add(obj) {
        if (this.find(obj)) {
            this.update(obj);
        } else {
            this.fileCache.writeTmpFileSync(obj, this._assetFileCacheName(obj.newRemote));
            this._cache.push(obj);
        }
    }

    /**
     * Find an individual item form the asset cache list
     * @param {Object} obj Asset cache object
     * @param {String} obj.remote The asset path as it exists in the content
     * @returns {Object} The found item from the asset cache list
     */
    find(obj) {
        let result = this._cache.find((item) => {
            return item.remote === obj.remote;
        });

        return result;
    }

    /**
     * Update the item in the asset cache list
     * @param {Object} obj Asset cache object
     * @param {String} obj.remote The asset path as it exists in the content
     */
    update(obj) {
        let foundIndex = this._cache.findIndex(x => x.remote === obj.remote);
        let newObj = Object.assign(this._cache[foundIndex], obj);
        this._cache[foundIndex] = newObj;

        this.fileCache.writeTmpFileSync(newObj, this._assetFileCacheName(obj.newRemote));
    }

    /**
     * List all assets in the cache
     * @returns {Array} AN array of cached asset objects
     */
    all() {
        return this._cache;
    }

    /**
     * Delete the object from the asset cache list
     * @param {Object} obj Asset cache object
     * @param {String} obj.remote The asset path as it exists in the content
     */
    delete(obj) {
        this._cache = remove(this._cache, (item) => {
            return item.remote === obj.remote;
        });
    }

    /**
     * Set the supplied array as the asset cache, or load from the saved JSON file
     * @async
     * @param {String|Array} data The path the cached asset JSON files folder, or an array of the same data
     */
    async load(data = null) {
        if (!data) {
            data = `${this.fileCache.tmpDir}/assets/`;
        }
        if (typeof data === 'object') {
            this._cache = data;
        } else {
            const files = await fs.readdir(data);
            for (const file of files) {
                let theJson = await fs.readJson(path.join(data, file));
                this._cache.push(theJson);
            }
        }
    }
}

export {
    AssetCache
};
