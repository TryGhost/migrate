import MigrateBase from './MigrateBase.js';

export type TagObject = {
    name: string;
    slug: string;
    description?: string;
    feature_image?: string;
    og_image?: string;
    og_title?: string;
    og_description?: string;
    twitter_image?: string;
    twitter_title?: string;
    twitter_description?: string;
    meta_title?: string;
    meta_description?: string;
    codeinjection_head?: string;
    codeinjection_foot?: string;
    canonical_url?: string;
};

export type TagDataObject = {
    data: TagObject;
};

export default class TagContext extends MigrateBase {
    #context;
    #schema;
    data: any = {};

    constructor(args?: any) {
        super();

        this.#context = this.constructor.name;

        let initialData = {};

        // If object supplied does not contain `initialData` or `schema`, use as initialData
        if (typeof args === 'object' && !args.initialData && !args.schema) {
            initialData = args;
        } else {
            initialData = args?.initialData ?? {};
        }

        // Define what fields are allowed, their types, validations, and defaults
        this.#schema = {
            name: {required: true, type: 'string', maxLength: 255},
            slug: {required: true, type: 'string', maxLength: 191},
            description: {type: 'string', maxLength: 500, default: null},
            feature_image: {type: 'string', maxLength: 2000},
            og_image: {type: 'string', maxLength: 2000},
            og_title: {type: 'string', maxLength: 300},
            og_description: {type: 'string', maxLength: 500},
            twitter_image: {type: 'string', maxLength: 2000},
            twitter_title: {type: 'string', maxLength: 300},
            twitter_description: {type: 'string', maxLength: 500},
            meta_title: {type: 'string', maxLength: 300},
            meta_description: {type: 'string', maxLength: 500},
            codeinjection_head: {type: 'text', maxLength: 65535},
            codeinjection_foot: {type: 'text', maxLength: 65535},
            canonical_url: {type: 'string', maxLength: 2000}
        };

        this.schema = this.#schema;

        // Push entires from the schema into the working object
        Object.entries(this.#schema).forEach((item: any) => {
            const [key, value] = item;
            this.data[key] = value.default ?? null;
        });

        // Set initial data if provided
        Object.entries(initialData).forEach((item: any) => {
            const [key, value] = item;
            this.data[key] = value;
        });
    }
}
