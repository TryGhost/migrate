import {join} from 'node:path';
import {Sequelize, DataTypes} from 'sequelize';

export default class AssetCache {
    // db: any;
    sequelize: any;
    Asset: any;
    assets: any;
    fileCache: any;

    constructor({fileCache}: {fileCache: any}) {
        this.fileCache = fileCache;

        const theCachePath = join(this.fileCache.tmpDir, 'assets-cache');

        // Create the cache DB if it doesn't exist
        // if (!this.fileCache.hasFile(join('assets-cache', 'assets.db'), 'tmp')) {
        //     this.fileCache.writeTmpFileSync('', join('assets-cache', 'assets.db'), false);
        // } else {
        //     // console.log(`File '${theCachePath + '/assets.db'}' already exists.`);
        // }
        // if (!this.fileCache.hasFile(join('assets', 'assets.db'), 'tmp')) {
        //     this.fileCache.writeTmpFileSync('', join('assets', 'assets.db'), false);
        // } else {
        //     // console.log(`File '${theCachePath + '/assets.db'}' already exists.`);
        // }

        // const sequelize = new Sequelize('sqlite::memory:');
        // const sequelize = new Sequelize(theCachePath + '/assets.db');
        const sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: theCachePath + '/assets.db',
            logging: false
        });
        const Asset = sequelize.define('Asset', {
            src: DataTypes.STRING,
            status: DataTypes.NUMBER,
            localPath: DataTypes.STRING,
            skip: DataTypes.STRING
        });

        this.sequelize = sequelize;
        this.Asset = Asset;
        // this.db = db;
    }

    async init() {
        // Use alter: true to automatically update the schema if columns are added
        // This will add missing columns like 'skip' to existing databases
        await this.sequelize.sync({alter: true});
    }

    /**
     * Add an item to the asset cache list
     * TODO: findOrCreate might make sense here
     */
    async add(src: string) {
        // Check if it exists first, and return that if so
        const existingAsset = await this.Asset.findOne({where: {src: src}});

        if (existingAsset) {
            return existingAsset;
        }

        // If not, insert it and return the new item
        const newAsset = await this.Asset.create({
            src: src
        });

        return newAsset;
    }

    async update(id: string, key: any, value: any) {
        // this.db.update((item: any) => item.uuid === uuid, (item: any) => ({...item, [key]: value}));

        return this.Asset.update({
            [key]: value
        },
        {
            where: {
                id: id
            }
        });
    }

    /**
     * Get all the items from the asset cache list
     */
    async getAll() {
        // TODO: Add pagination
        // return this.db.get();
        return this.Asset.findAll();
    }

    /**
     * Find an individual item form the asset cache list
     */
    // async find(clauses: any) {
    //     return this.db.get((item: any) => clauses(item));
    // }

    /**
     * A common method to find an item by its src
     */
    async findBySrc(src: string) {
        // return this.db.getOne((item: any) => item.src === src); // Returns the record with id 1
        const existingAsset = await this.Asset.findOne({where: {src: src}});
        return existingAsset;
    }

    /**
     * Delete an item from the asset cache list
     */
    // async deleteBySrc(src: string) {
    //     this.db.delete((item: any) => item.src === src);
    // }

    /**
     * Used in tests, not intended for general use
     */
    async _reset() {
        /* c8 ignore next 3 */
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('This method is only for use in tests');
        }

        await this.Asset.drop();
    }
}
