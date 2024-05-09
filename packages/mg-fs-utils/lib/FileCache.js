import {join, parse, extname, basename, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import _ from 'lodash';
import {writeFileSync, readdirSync, rmdir, lstatSync, existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {outputJson, outputJsonSync, mkdirpSync, readJson, remove, outputFile} from 'fs-extra/esm';
import imageTransform from '@tryghost/image-transform';
import errors from '@tryghost/errors';
import transliterate from 'transliteration';
import csv from './csv.js';
import {cacheNameFromPath} from './utils.js';

const basePath = 'mg';
const knownImageExtensions = ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz', '.ico', 'webp'];

export default class FileCache {
    constructor(cacheName, options = {}) {
        this.tmpPath = options.tmpPath || false;

        this.originalName = cacheName;
        this.options = Object.assign({contentDir: true}, options);

        // Remove any extension, handles removing TLDs as well if the name is based on a URL
        this.cacheName = cacheNameFromPath(cacheName);

        if (options.batchName) {
            this.batchName = options.batchName;
        }
    }

    // This will be the path specified by `--tmpPath` if set. If not, it'll use a hidden tmp dir
    get tmpDirPath() {
        return this.tmpPath || tmpdir();
    }

    get cacheBaseDir() {
        return join(this.tmpDirPath, basePath);
    }

    get cacheKey() {
        if (!this._cacheKey) {
            // Unique hash based on full zip path + the original filename
            this._cacheKey = `${createHash('md5').update(this.originalName).digest('hex')}-${this.cacheName}`;
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
            this._cacheDir = join(this.tmpDirPath, basePath, this.cacheKey);
            mkdirpSync(join(this.tmpDir));

            // don't create the content directory when migrating members
            if (this.options && this.options.contentDir) {
                mkdirpSync(join(this.imageDir));
                mkdirpSync(join(this.mediaDir));
                mkdirpSync(join(this.filesDir));
            } else {
                mkdirpSync(join(this.zipDir));
            }
        }
        return this._cacheDir;
    }

    get tmpDir() {
        return join(this.cacheDir, 'tmp');
    }

    get zipDir() {
        return join(this.cacheDir, 'zip');
    }

    get jsonDir() {
        return this.zipDir;
    }

    get imagePath() {
        return join('content', 'images');
    }

    get imageDir() {
        return join(this.zipDir, this.imagePath);
    }

    get mediaPath() {
        return join('content', 'media');
    }

    get mediaDir() {
        return join(this.zipDir, this.mediaPath);
    }

    get filesPath() {
        return join('content', 'files');
    }

    get filesDir() {
        return join(this.zipDir, this.filesPath);
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
        let fileNameNoExt = parse(src).name;
        let fileNameExt = extname(src);

        let safeFileNameNoExt = transliterate.slugify(fileNameNoExt, {
            separator: '_'
        });

        let result = src.replace(`${fileNameNoExt}${fileNameExt}`, `${safeFileNameNoExt}${fileNameExt}`);

        return result;
    }

    ensureJsonExtension({filename, isJSON = true}) {
        return (isJSON && !filename.endsWith('.json')) ? `${filename}.json` : filename; // Ensure the `.json` extension is only added if needed
    }

    resolveImageFileName(filename) {
        return this.resolveFileName(filename, 'images');
    }

    resolveMediaFileName(filename) {
        return this.resolveFileName(filename, 'media');
    }

    resolveFileName(filename, type = 'images') {
        let ext = extname(filename);

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
        let theBasename = basename(filename);
        let filePath = filename.replace(theBasename, '');
        if (filePath.length > 200) {
            let shorter = filePath.slice(-200);
            filename = join('/', shorter, theBasename);
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
            storagePath: join(typeDir, filename),
            outputPath: join('/', typePath, filename)
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
        let fileNameWithExt = this.ensureJsonExtension({filename, isJSON});
        let filepath = join(this.tmpDir, fileNameWithExt);

        if (isJSON) {
            await outputJson(filepath, data, {spaces: 2});
        } else {
            await writeFile(filepath, data);
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
        let fileNameWithExt = this.ensureJsonExtension({filename, isJSON});
        let filepath = join(this.tmpDir, fileNameWithExt);

        if (isJSON) {
            outputJsonSync(filepath, data, {spaces: 2});
        } else {
            writeFileSync(filepath, data);
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
        let filepath = join(this.tmpDir, fileNameWithExt);

        return await readJson(filepath);
    }

    /**
     * Read a JSON file containing temporary data
     *
     * @param {String} filename - name of file to read
     */
    hasTmpJSONFile(filename) {
        let fileNameWithExt = (filename.endsWith('.json')) ? filename : `${filename}.json`; // Ensure the `.json` extension is only added if needed
        let filepath = join(this.tmpDir, fileNameWithExt);

        return existsSync(filepath);
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
        let basepath = options.path ? dirname(options.path) : this.zipDir;
        let filepath = join(basepath, filename);

        if (isJSON) {
            await outputJson(filepath, data, {spaces: 2});
        } else {
            await writeFile(filepath, data);
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
        const filePath = join(this.cacheDir, `report-${fileName}.csv`);

        const dedupedData = _.uniqBy(report.data, (e) => {
            return e.src;
        });

        const fileData = csv.jsonToCSV(dedupedData);

        await writeFile(filePath, fileData);

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
    async writeContentFile(data, options) {
        if (!options.storagePath || !options.outputPath) {
            options = this.resolveImageFileName(options.filename);
        }

        const fileExt = extname(options.filename).substr(1);

        // CASE: image manipulator is incapable of transforming file (e.g. .bmp)
        if (options.optimize && imageTransform.canTransformToFormat(fileExt)) {
            try {
                const originalStoragePath = imageTransform.generateOriginalImageName(options.storagePath);
                await this.saveFile(originalStoragePath, data);
                const optimizedStoragePath = options.storagePath;
                const optimizedData = await imageTransform.resizeFromBuffer(data, {width: 2000});
                await this.saveFile(optimizedStoragePath, optimizedData);
            } catch (error) {
                // Silently fail and only save the original image without manipulation
                // TODO: Catch errors and push to ctx.errors
                await this.saveFile(options.storagePath, data);
            }
        } else {
            await this.saveFile(options.storagePath, data);
        }

        return options.outputPath;
    }

    /**
     * Alias fs-extra's 'outputFile' so we can more easily mock it
     *
     * @param {String} string - absolute path to where file should be saved
     * @param {String|Buffer|Uint8Array} data - the file data to be saved
     */
    async saveFile(storagePath, data) {
        return outputFile(storagePath, data);
    }

    /**
     * Alias fs-extra's 'remove' so we can more easily mock it
     *
     * @param {String} string - absolute path to where file should be deleted
     */
    async deleteFileOrDir(storagePath) {
        return remove(storagePath);
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
            pathToCheck = join(this[`${type}Dir`], filename);
        }

        try {
            return existsSync(pathToCheck);
        } catch (error) {
            return false;
        }
    }

    async emptyCurrentCacheDir() {
        if (!this.cacheKey) {
            return false;
        }

        let siteCachePath = join(this.cacheBaseDir, this.cacheKey);

        try {
            await remove(siteCachePath);
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

        existsSync(directory, (err) => {
            if (err) {
                throw err;
            }
            return true;
        });

        let itemsToDelete = [];
        const dirContents = readdirSync(directory).map((fileName) => {
            return join(directory, fileName);
        });

        dirContents.forEach((item) => {
            if (lstatSync(item).isDirectory()) {
                itemsToDelete.push(item);
            }
        });

        itemsToDelete.forEach((item) => {
            rmdir(item, {recursive: true}, (err) => {
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

