import {z} from 'zod/v4';
import ghValidate from '@tryghost/validator';
import MigrateBase from './MigrateBase.js';

export const authorZodSchema = z.object({
    name: z.string().max(191),
    slug: z.string().max(191),
    email: z.string().max(191).refine(val => ghValidate.isEmail(val), {message: 'Invalid email address'}),
    profile_image: z.string().max(2000).nullable(),
    cover_image: z.string().max(2000).nullable(),
    bio: z.string().max(250).nullable(),
    website: z.string().max(2000).nullable(),
    location: z.string().max(150).nullable(),
    facebook: z.string().max(2000).nullable(),
    twitter: z.string().max(2000).nullable(),
    meta_title: z.string().max(300).nullable(),
    meta_description: z.string().max(500).nullable(),
    role: z.enum(['Contributor', 'Author', 'Editor', 'Administrator']).default('Contributor')
});

export type AuthorObject = z.infer<typeof authorZodSchema>;

export type AuthorDataObject = {
    data: AuthorObject;
};

export default class AuthorContext extends MigrateBase {
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

        this.schema = authorZodSchema;
        this.initializeData();

        // Set initial data if provided
        Object.entries(initialData).forEach(([key, value]) => {
            this.data[key] = value;
        });
    }
}
