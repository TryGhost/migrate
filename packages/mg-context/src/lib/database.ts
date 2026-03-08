/* eslint-disable ghost/filenames/match-exported-class */
import {Sequelize, DataTypes, Model, ModelStatic} from 'sequelize';

export interface DatabaseModels {
    sequelize: Sequelize;
    Post: ModelStatic<Model>;
    Tag: ModelStatic<Model>;
    Author: ModelStatic<Model>;
    PostTag: ModelStatic<Model>;
    PostAuthor: ModelStatic<Model>;
}

export async function createDatabase(dbPath: string): Promise<DatabaseModels> {
    const sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: dbPath,
        logging: false
    });

    const Post = sequelize.define('Post', {
        data: {type: DataTypes.TEXT, allowNull: false},
        source: {type: DataTypes.TEXT, defaultValue: '{}'},
        meta: {type: DataTypes.TEXT, defaultValue: '{}'},
        content_format: {type: DataTypes.STRING, defaultValue: 'html'}
    }, {timestamps: false});

    const Tag = sequelize.define('Tag', {
        data: {type: DataTypes.TEXT, allowNull: false},
        slug: {type: DataTypes.STRING, allowNull: true},
        name: {type: DataTypes.STRING, allowNull: true}
    }, {
        timestamps: false,
        indexes: [{fields: ['slug']}, {fields: ['name']}]
    });

    const Author = sequelize.define('Author', {
        data: {type: DataTypes.TEXT, allowNull: false},
        slug: {type: DataTypes.STRING, allowNull: true},
        name: {type: DataTypes.STRING, allowNull: true},
        email: {type: DataTypes.STRING, allowNull: true}
    }, {
        timestamps: false,
        indexes: [{fields: ['slug']}, {fields: ['name']}, {fields: ['email']}]
    });

    const PostTag = sequelize.define('PostTag', {
        post_id: {type: DataTypes.INTEGER, allowNull: false},
        tag_id: {type: DataTypes.INTEGER, allowNull: false},
        sort_order: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0}
    }, {timestamps: false});

    const PostAuthor = sequelize.define('PostAuthor', {
        post_id: {type: DataTypes.INTEGER, allowNull: false},
        author_id: {type: DataTypes.INTEGER, allowNull: false},
        sort_order: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0}
    }, {timestamps: false});

    await sequelize.sync({alter: true});

    return {sequelize, Post, Tag, Author, PostTag, PostAuthor};
}
