const _ = require('lodash');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const imageTransform = require('@tryghost/image-transform');
const errors = require('@tryghost/errors');

const basePath = 'mg';
const knownExtensions = ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz', '.ico', 'webp'];

class FileCache {
    constructor(cacheName, options = {}) {
        this.originalName = cacheName;
        this.options = Object.assign({contentDir: true}, options);

        // Remove any extension, handles removing TLDs as well if the name is based on a URL
        let ext = path.extname(cacheName);
        this.cacheName = path.basename(cacheName, ext);

        if (options.batchName) {
            this.batchName = options.batchName;
        }
    }

    get cacheBaseDir() {
        return path.join(os.tmpdir(), basePath);
    }

    get cacheKey() {
        if (!this._cacheKey) {
            // Unique hash based on full zip path + the original filename
            this._cacheKey = `${crypto.createHash('md5').update(this.originalName).digest('hex')}-${this.cacheName}`;
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

            // don't create the content directory when migrating members
            if (this.options && this.options.contentDir) {
                fs.mkdirpSync(path.join(this.imageDir));
            } else {
                fs.mkdirpSync(path.join(this.zipDir));
            }
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

    get defaultCacheFileName() {
        if (this.batchName) {
            return `gh-${this.cacheName}-batch-${this.batchName}-${Date.now()}`;
        }
        return `gh-${this.cacheName}-${Date.now()}`;
    }

    get defaultTmpJSONFileName() {
        return `${this.defaultCacheFileName}.json`;
    }

    get defaultTmpCSVFileName() {
        return `${this.defaultCacheFileName}.csv`;
    }

    get defaultZipFileName() {
        return `${this.defaultCacheFileName}.zip`;
    }

    get defaultErrorFileName() {
        return `${this.defaultCacheFileName}.errors.json`;
    }

    // @TODO: move this somewhere shared,
    // it's currently duplicated from https://github.com/TryGhost/Ghost-Storage-Base/blob/master/BaseStorage.js#L62
    sanitizeFileName(src) {
        let basename;

        // remove unsupported characters from the dir name first
        src = src.replace(src, this.sanitizeDirName(src));

        basename = path.basename(src);
        // below only matches ascii characters, @, and .
        // unicode filenames like город.zip would therefore resolve to ----.zip
        return src.replace(basename, basename.replace(/[^\w@.]/gi, '-'));
    }

    sanitizeDirName(src) {
        // Slighly different regex from sanitizing the filename, as we still want to
        // support characters like `/`, `_`, and `-`
        return src.replace(/[^\w@./-_]/gi, '-');
    }

    resolveImageFileName(filename) {
        let ext = path.extname(filename);

        // remove the base imagePath if it already exists in the path, so we don't get nested imagePath directories
        filename = filename.replace(`/${this.imagePath}`, '');

        // replace the basename part with a sanitized version
        filename = filename.replace(filename, this.sanitizeFileName(filename));

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
     * Create a file to store temporary data
     *
     * @param {Object} data - a valid Ghost JSON object or data to store
     * @param {String} filename - name of file to write
     * @param {Boolean} isJSON - defaults to write a JSON file
     */
    async writeTmpFile(data, filename, isJSON = true) {
        let filepath = path.join(this.tmpDir, filename);

        if (isJSON) {
            await fs.outputJson(filepath, data, {spaces: 2});
        } else {
            await fs.writeFile(filepath, data);
        }

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
     * Create a CSV or JSON file with our processed data
     *
     * @param {Object} data - a valid Ghost JSON object or CSV Members data
     * @param {Object} options - config
     */
    async writeGhostImportFile(data, options = {}) {
        options = Object.assign({isJSON: true}, options);
        const {isJSON} = options;

        // Create a temporary version first
        let filename = options.tmpFilename
            || (isJSON ? this.defaultTmpJSONFileName : this.defaultTmpCSVFileName);

        await this.writeTmpFile(data, filename, isJSON);

        // Then also write it as "the" JSON file in the zip folder
        filename = options.filename || `ghost-import.json`;
        let basepath = options.path ? path.dirname(options.path) : this.zipDir;
        let filepath = path.join(basepath, filename);

        if (isJSON) {
            await fs.outputJson(filepath, data, {spaces: 2});
        } else {
            await fs.writeFile(filepath, data);
        }

        return filepath;
    }

    /**
     * Create a JSON file with our errors
     *
     * @param {Object} data - a valid JSON object containing errors
     * @param {Object} options - config
     */
    async writeErrorJSONFile(data, options = {}) {
        const filename = options.filename || this.defaultErrorFileName;

        return await this.writeTmpFile(data, filename);
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

        // CASE: image manipulator is uncapable of transforming file (e.g. .gif)
        let fileExt = path.parse(options.filename).ext;
        if (options.optimize && imageTransform.canTransformFileExtension(fileExt)) {
            const optimizedStoragePath = options.storagePath;
            const originalStoragePath = imageTransform.generateOriginalImageName(options.storagePath);
            const optimizedData = await imageTransform.resizeFromBuffer(data, {width: 2000});

            await fs.outputFile(optimizedStoragePath, optimizedData);
            await fs.outputFile(originalStoragePath, data);
        } else {
            await fs.outputFile(options.storagePath, data);
        }

        return options.outputPath;
    }

    /**
    * Check if we've got this file already
    *
    * @param {String} filename
    * @param {String} type - one of tmp, json, image
    */
    hasFile(filename, type) {
        let pathToCheck = filename;

        if (type && !_.includes(['tmp', 'json', 'image'], type)) {
            throw new errors.GhostError({message: 'Unknown file type'});
        } else if (type) {
            pathToCheck = path.join(this[`${type}Dir`], filename);
        }

        return fs.existsSync(pathToCheck);
    }

    /**
     * Empties the local cache directory
     */
    async emptyCacheDir() {
        const directory = this.cacheBaseDir + '/';

        fs.existsSync(directory, (err) => {
            if (err) {
                throw err;
            }
            return true;
        });

        let itemsToDelete = [];
        const dirContents = fs.readdirSync(directory).map((fileName) => {
            return path.join(directory, fileName);
        });

        dirContents.forEach((item) => {
            if (fs.lstatSync(item).isDirectory()) {
                itemsToDelete.push(item);
            }
        });

        itemsToDelete.forEach((item) => {
            fs.rmdir(item, {recursive: true}, (err) => {
                if (err) {
                    throw err;
                }
                return true;
            });
        });

        return {
            directory: directory,
            files: itemsToDelete
        };
    }
}

module.exports = FileCache;
