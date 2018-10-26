const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

class FileCache {
    constructor(pathName) {
        this.pathName = pathName;
    }

    get cacheKey() {
        if (!this._cacheKey) {
            this._cacheKey = crypto.createHash('md5').update(this.pathName).digest('hex');
        }
        return this._cacheKey;
    }

    get cacheDir() {
        if (!this._cacheDir) {
            this._cacheDir = path.join(os.tmpdir(), this.cacheKey);
            fs.mkdirpSync(this._cacheDir);
        }
        return this._cacheDir;
    }

    /**
     * Create a JSON file with our processed data
     *
     * @param {Object} data - a valid Ghost JSON object
     * @param {Object} options - config
     */
    writeJSONFile(data, options = {}) {
        let filename = options.filename || `ghost-import-${Date.now()}.json`;
        let filepath = path.join(this.cacheDir, filename);

        fs.outputJsonSync(filepath, data, {spaces: 2});

        this.JSONFileName = filepath;
    }
}

exports.FileCache = FileCache;
