const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const basePath = 'mg';

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

    /**
     *  Cache Dir
     *  We maintain a folder structure like:
     *  /mg/<hash>
     *    - /tmp
     *      - temporary backup files
     *    - /zip
     *      - json file
     *      - /content/images
     *        - image files
     */
    get cacheDir() {
        if (!this._cacheDir) {
            this._cacheDir = path.join(os.tmpdir(), basePath, this.cacheKey);
            fs.mkdirpSync(path.join(this._cacheDir, 'tmp'));
            fs.mkdirpSync(path.join(this._cacheDir, 'zip', 'content', 'images'));
        }
        return this._cacheDir;
    }

    get tmpDir() {
        return path.join(this.cacheDir, 'tmp');
    }

     get jsonDir() {
        return path.join(this.cacheDir, 'zip');
    }

     get imageDir() {
        return path.join(this.cacheDir, 'zip', 'content', 'images');
    }

    /**
     * Create a JSON file with our processed data
     *
     * @param {Object} data - a valid Ghost JSON object
     * @param {Object} options - config
     */
    writeJSONFile(data, options = {}) {
        let filename = options.filename || `ghost-import-${Date.now()}.json`;
        let filepath = path.join(this.jsonDir, filename);

        fs.outputJsonSync(filepath, data, {spaces: 2});

        return filepath;
    }
}

exports.FileCache = FileCache;
