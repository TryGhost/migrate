import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import _ from 'lodash';
import fs from 'fs-extra';
import imageTransform from '@tryghost/image-transform';
import errors from '@tryghost/errors';
import transliterate from 'transliteration';
import csv from './csv.js';

const basePath = 'mg';
const knownImageExtensions = ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz', '.ico', 'webp'];

class FileCache {
    constructor(cacheName, options = {}) {
        this.tmpPath = options.tmpPath || false;

        this.originalName = cacheName;
        this.options = Object.assign({contentDir: true}, options);

        // Remove any extension, handles removing TLDs as well if the name is based on a URL
        let ext = path.extname(cacheName);
        this.cacheName = path.basename(cacheName, ext);

        if (options.batchName) {
            this.batchName = options.batchName;
        }
    }

    // This will be the path specified by `--tmpPath` if set. If not, it'll use a hidden tmp dir
    get tmpDirPath() {
        return this.tmpPath || os.tmpdir();
    }

    get cacheBaseDir() {
        return path.join(this.tmpDirPath, basePath);
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
     *      - /content/media
     *        - non-image media files like videos or audio files
     *      - /content/files
     *        - non-image and non-media files like pdfs
     */
    get cacheDir() {
        if (!this._cacheDir) {
            this._cacheDir = path.join(this.tmpDirPath, basePath, this.cacheKey);
            fs.mkdirpSync(path.join(this.tmpDir));

            // don't create the content directory when migrating members
            if (this.options && this.options.contentDir) {
                fs.mkdirpSync(path.join(this.imageDir));
                fs.mkdirpSync(path.join(this.mediaDir));
                fs.mkdirpSync(path.join(this.filesDir));
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

    get mediaPath() {
        return path.join('content', 'media');
    }

    get mediaDir() {
        return path.join(this.zipDir, this.mediaPath);
    }

    get filesPath() {
        return path.join('content', 'files');
    }

    get filesDir() {
        return path.join(this.zipDir, this.filesPath);
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

    convertMbToBytes(mb) {
        return (mb * 1048576);
    }

    sanitizeFileName(src) {
        let fileNameNoExt = path.parse(src).name;

        let safeFileNameNoExt = transliterate.slugify(fileNameNoExt);

        return src.replace(fileNameNoExt, safeFileNameNoExt);
    }

    resolveImageFileName(filename) {
        return this.resolveFileName(filename, 'images');
    }

    resolveMediaFileName(filename) {
        return this.resolveFileName(filename, 'media');
    }

    resolveFileName(filename, type = 'images') {
        let ext = path.extname(filename);

        let typeDir = null;
        let typePath = null;

        if (type === 'images') {
            typeDir = this.imageDir;
            typePath = this.imagePath;

            // CASE: In ImageSCraper, we infer file type based on the first few bytes of the image.
            // The extension we get for `image/jpeg` is `.jpg`, so here transform `.jpeg` to `.jpg`
            // to ensure we don't miss images that already exist
            if (ext.toLowerCase() === '.jpeg') {
                filename = filename.replace('.jpeg', '.jpg');
            }
        } else if (type === 'media') {
            typeDir = this.mediaDir;
            typePath = this.mediaPath;
        } else {
            typeDir = this.filesDir;
            typePath = this.filesPath;
        }

        // remove the base filePath if it already exists in the path, so we don't get nested filePath directories
        filename = filename.replace(`/${typePath}`, '');

        // replace the basename part with a sanitized version
        filename = filename.replace(filename, this.sanitizeFileName(filename));

        // CASE: Some image URLs are very long and can cause various issues with storage.
        // If the filepath is more than 200 characters, slice the last 200 and use that
        let theBasename = path.basename(filename);
        let filePath = filename.replace(theBasename, '');
        if (filePath.length > 200) {
            let shorter = filePath.slice(-200);
            filename = path.join('/', shorter, theBasename);
        }

        // @TODO: use content type on request to infer this, rather than assuming jpeg?
        if (type === 'image' && !_.includes(knownImageExtensions, ext)) {
            if (!ext) {
                filename += '.jpeg';
            } else {
                filename.replace(ext, '.jpeg');
            }
        }

        return {
            filename: filename,
            storagePath: path.join(typeDir, filename),
            outputPath: path.join('/', typePath, filename)
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
        let fileNameWithExt = (filename.endsWith('.json')) ? filename : `${filename}.json`; // Ensure the `.json` extension is only added if needed
        let filepath = path.join(this.tmpDir, fileNameWithExt);

        if (isJSON) {
            await fs.outputJson(filepath, data, {spaces: 2});
        } else {
            await fs.writeFile(filepath, data);
        }

        return filepath;
    }

    /**
     * Create a file to store temporary data
     *
     * @param {Object} data - a valid Ghost JSON object or data to store
     * @param {String} filename - name of file to write
     * @param {Boolean} isJSON - defaults to write a JSON file
     */
    writeTmpFileSync(data, filename, isJSON = true) {
        let fileNameWithExt = (filename.endsWith('.json')) ? filename : `${filename}.json`; // Ensure the `.json` extension is only added if needed
        let filepath = path.join(this.tmpDir, fileNameWithExt);

        if (isJSON) {
            fs.outputJsonSync(filepath, data, {spaces: 2});
        } else {
            fs.writeFileSync(filepath, data);
        }

        return filepath;
    }

    /**
     * Read a JSON file containing temporary data
     *
     * @param {String} filename - name of file to read
     */
    async readTmpJSONFile(filename) {
        let fileNameWithExt = (filename.endsWith('.json')) ? filename : `${filename}.json`; // Ensure the `.json` extension is only added if needed
        let filepath = path.join(this.tmpDir, fileNameWithExt);

        return await fs.readJson(filepath);
    }

    /**
     * Read a JSON file containing temporary data
     *
     * @param {String} filename - name of file to read
     */
    hasTmpJSONFile(filename) {
        let fileNameWithExt = (filename.endsWith('.json')) ? filename : `${filename}.json`; // Ensure the `.json` extension is only added if needed
        let filepath = path.join(this.tmpDir, fileNameWithExt);

        return fs.existsSync(filepath);
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
     * Create a CSV file with our reports
     *
     * @param {Object} data - a valid JSON object
     * @param {Object} options - config
     */
    async writeReportCSVFile(report, options = {}) {
        const fileName = options.filename || false;
        const filePath = path.join(this.cacheDir, `report-${fileName}.csv`);

        const dedupedData = _.uniqBy(report.data, (e) => {
            return e.src;
        });

        const fileData = csv.jsonToCSV(dedupedData);

        await fs.writeFile(filePath, fileData);

        return {
            data: dedupedData,
            path: filePath
        };
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

        const fileExt = path.extname(options.filename).substr(1);

        // CASE: image manipulator is incapable of transforming file (e.g. .bmp)
        if (options.optimize && imageTransform.canTransformToFormat(fileExt)) {
            try {
                const originalStoragePath = imageTransform.generateOriginalImageName(options.storagePath);
                await fs.outputFile(originalStoragePath, data);
                const optimizedStoragePath = options.storagePath;
                const optimizedData = await imageTransform.resizeFromBuffer(data, {width: 2000});
                await fs.outputFile(optimizedStoragePath, optimizedData);
            } catch (error) {
                // Silently fail and only save the original image without manipulation
                // TODO: Catch errors and push to ctx.errors
                await fs.outputFile(options.storagePath, data);
            }
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

        if (type && !_.includes(['tmp', 'json', 'image', 'zip'], type)) {
            throw new errors.NotFoundError({message: 'Unknown file type'});
        } else if (type) {
            pathToCheck = path.join(this[`${type}Dir`], filename);
        }

        try {
            return fs.existsSync(pathToCheck);
        } catch (error) {
            return false;
        }
    }

    async emptyCurrentCacheDir() {
        if (!this.cacheKey) {
            return false;
        }

        let siteCachePath = path.join(this.cacheBaseDir, this.cacheKey);

        try {
            await fs.remove(siteCachePath);
            return true;
        } catch (error) {
            throw new errors.NotFoundError({message: 'Unknown file type'});
        }
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

export {
    FileCache
};
