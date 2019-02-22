const _ = require('lodash');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const basePath = 'mg';
const knownExtensions = ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz', '.ico'];

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
            fs.mkdirpSync(path.join(this.tmpDir));
            fs.mkdirpSync(path.join(this.imageDir));
        }
        return this._cacheDir;
    }

    get tmpDir() {
        return path.join(this.cacheDir, 'tmp');
    }

    get zipDir() {
        return path.join(this.cacheDir, 'zip');
    }

    get jsonDir() {
        return this.zipDir;
    }

    get imagePath() {
        return path.join('content', 'images');
    }

    get imageDir() {
        return path.join(this.zipDir, this.imagePath);
    }

    // @TODO: move this somewhere shared,
    // it's currently duplicated from https://github.com/TryGhost/Ghost-Storage-Base/blob/master/BaseStorage.js#L62
    sanitizeFileName(src) {
        // below only matches ascii characters, @, and .
        // unicode filenames like город.zip would therefore resolve to ----.zip
        return src.replace(/[^\w@.]/gi, '-');
    }

    resolveImageFileName(filename) {
        let basename = path.basename(filename);
        let ext = path.extname(filename);

        // replace the basename part with a sanitized version
        filename = filename.replace(basename, this.sanitizeFileName(basename));

        // @TODO: use content type on request to infer this, rather than assuming jpeg?
        if (!_.includes(knownExtensions, ext)) {
            if (!ext) {
                filename += '.jpeg';
            } else {
                filename.replace(ext, '.jpeg');
            }
        }

        return {
            filename: filename,
            storagePath: path.join(this.imageDir, filename),
            outputPath: path.join('/', this.imagePath, filename)
        };
    }

    /**
     * Create a JSON file to store temporary data
     *
     * @param {Object} data - a valid Ghost JSON object
     * @param {String} filename - name of file to write
     */
    async writeTmpJSONFile(data, filename) {
        let filepath = path.join(this.tmpDir, filename);

        await fs.outputJson(filepath, data, {spaces: 2});

        return filepath;
    }

    /**
     * Read a JSON file containing temporary data
     *
     * @param {String} filename - name of file to read
     */
    async readTmpJSONFile(filename) {
        let filepath = path.join(this.tmpDir, filename);

        return await fs.readJson(filepath);
    }

    /**
     * Create a JSON file with our processed data
     *
     * @param {Object} data - a valid Ghost JSON object
     * @param {Object} options - config
     */
    async writeGhostJSONFile(data, options = {}) {
        let filename = options.filename || `ghost-import-${Date.now()}.json`;
        let basepath = options.path ? path.dirname(options.path) : this.zipDir;
        let filepath = path.join(basepath, filename);

        await fs.outputJson(filepath, data, {spaces: 2});

        return filepath;
    }

    /**
     * Create a binary image file with fetched data
     *
     * @param {String} data - a valid binary image
     * @param {Object} options - a resolved file name
     */
    async writeImageFile(data, options) {
        if (!options.storagePath || !options.outputPath) {
            options = this.resolveImageFileName(options.filename);
        }

        await fs.outputFile(options.storagePath, data);

        return options.outputPath;
    }

    /**
    * Check if we've got this file already
    *
    * @param {String} filename
    * @param {String} type - one of tmp, json, image
    */
    hasFile(filename, type) {
        if (!_.includes(['tmp', 'json', 'image'], type)) {
            return new Error('Unknown file type');
        }
        let dir = this[`${type}Dir`];

        return fs.existsSync(path.join(dir, filename));
    }
}

module.exports = FileCache;
