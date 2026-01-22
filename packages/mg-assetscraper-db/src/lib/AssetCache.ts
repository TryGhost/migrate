import {join} from 'node:path';
import {Sequelize, DataTypes, Model, ModelStatic} from 'sequelize';
import type {FileCache, AssetCacheEntry} from './types.js';

interface AssetAttributes {
    id?: number;
    src: string;
    status?: number;
    localPath?: string;
    skip?: string;
}

interface AssetModel extends Model<AssetAttributes>, AssetAttributes {}

export default class AssetCache {
    #sequelize: Sequelize;
    #Asset: ModelStatic<AssetModel>;
    #fileCache: FileCache;

    constructor({fileCache}: {fileCache: FileCache}) {
        this.#fileCache = fileCache;

        const theCachePath = join(this.#fileCache.tmpDir, 'assets-cache');

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

        this.#sequelize = sequelize;
        this.#Asset = Asset as ModelStatic<AssetModel>;
    }

    async init(): Promise<void> {
        // Use alter: true to automatically update the schema if columns are added
        // This will add missing columns like 'skip' to existing databases
        await this.#sequelize.sync({alter: true});
    }

    async add(src: string): Promise<AssetModel> {
        // Check if it exists first, and return that if so
        const existingAsset = await this.#Asset.findOne({where: {src: src}});

        if (existingAsset) {
            return existingAsset;
        }

        // If not, insert it and return the new item
        const newAsset = await this.#Asset.create({
            src: src
        });

        return newAsset;
    }

    async update(id: number, key: keyof AssetAttributes, value: string | number): Promise<[affectedCount: number]> {
        return this.#Asset.update({
            [key]: value
        },
        {
            where: {
                id: id
            }
        });
    }

    async getAll(): Promise<AssetModel[]> {
        return this.#Asset.findAll();
    }

    async findBySrc(src: string): Promise<AssetModel | null> {
        const existingAsset = await this.#Asset.findOne({where: {src: src}});
        return existingAsset;
    }

    /**
     * Used in tests, not intended for general use
     */
    async _reset(): Promise<void> {
        /* c8 ignore next 3 */
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('This method is only for use in tests');
        }

        await this.#Asset.drop();
    }
}
