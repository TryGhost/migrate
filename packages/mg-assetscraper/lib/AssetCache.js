const _ = require('lodash');

class AssetCache {
    /**
     * @param {FileCache} fileCache
     */
    constructor(fileCache) {
        this.fileCache = fileCache;

        this._fileName = 'file-response-cache.json';
        this._cache = [];
    }

    /**
     * Add an item to the asset cache list
     * @param {Object} obj Asset cache object
     */
    add(obj) {
        if (!this.find(obj)) {
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
        this._cache[foundIndex] = obj;
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
        this._cache = _.remove(this._cache, {
            remote: obj.remote
        });
    }

    /**
     * @private
     * Check if a saved asset cache list JSON file exists
     * @returns {Bool}
     */
    hasCacheFile() {
        return this.fileCache.hasTmpJSONFile(this._fileName);
    }

    /**
     * Set the supplied array as the asset cache, or load from the saved JSON file
     * @async
     * @param {Array} cacheArray
     */
    async load(cacheArray = null) {
        if (cacheArray) {
            this._cache = cacheArray;
        } else {
            if (this.hasCacheFile()) {
                this._cache = await this.fileCache.readTmpJSONFile(this._fileName);
            } else {
                this._cache = [];
            }
        }
    }

    /**
     * Save the asset cache list as a JSON file
     * @async
     */
    async writeFile() {
        await this.fileCache.writeTmpFile(this._cache, this._fileName);
    }
}

module.exports = AssetCache;
