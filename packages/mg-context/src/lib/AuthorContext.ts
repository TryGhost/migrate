import MigrateBase from './MigrateBase.js';

export type AuthorObject = {
    name: string;
    slug: string;
    email?: string;
    profile_image?: string;
    cover_image?: string;
    bio?: string;
    website?: string;
    location?: string;
    facebook?: string;
    twitter?: string;
    meta_title?: string;
    meta_description?: string;
    role?: 'Contributor' | 'Author' | 'Editor' | 'Administrator';
    default?: string;
};

export type AuthorDataObject = {
    data: AuthorObject;
};

export default class AuthorContext extends MigrateBase {
    #schema;
    data: any = {};

    constructor(args?: any) {
        super();

        let initialData = {};

        // If object supplied does not contain `initialData` or `schema`, use as initialData
        if (typeof args === 'object' && !args.initialData && !args.schema) {
            initialData = args;
        } else {
            initialData = args?.initialData ?? {};
        }

        // Define what fields are allowed, their types, validations, and defaults
        this.#schema = {
            name: {require: true, type: 'string', maxLength: 191},
            slug: {require: true, type: 'string', maxLength: 191},
            email: {require: true, type: 'string', maxLength: 191},
            profile_image: {type: 'string', maxLength: 2000},
            cover_image: {type: 'string', maxLength: 2000},
            bio: {type: 'text', maxLength: 200},
            website: {type: 'string', maxLength: 2000},
            location: {type: 'text', maxLength: 150},
            facebook: {type: 'string', maxLength: 2000},
            twitter: {type: 'string', maxLength: 2000},
            meta_title: {type: 'string', maxLength: 300},
            meta_description: {type: 'string', maxLength: 500},
            role: {required: true, type: 'string', choices: ['Contributor', 'Author', 'Editor', 'Administrator'], default: 'Contributor'}
        };

        this.schema = this.#schema;

        // Push entires from the schema into the working object
        Object.entries(this.#schema).forEach((item: any) => {
            const [key, value] = item;
            this.data[key] = value.default ?? null;
        });

        // Set initial data if provided
        Object.entries(initialData).forEach(([key, value]) => {
            this.data[key] = value;
        });
    }
}
