import {z} from 'zod/v4';
import MigrateBase from './MigrateBase.js';
import type {DatabaseModels} from './database.js';

export const tagZodSchema = z.object({
    name: z.string().max(255),
    slug: z.string().max(191),
    description: z.string().max(500).nullable(),
    feature_image: z.string().max(2000).nullable(),
    og_image: z.string().max(2000).nullable(),
    og_title: z.string().max(300).nullable(),
    og_description: z.string().max(500).nullable(),
    twitter_image: z.string().max(2000).nullable(),
    twitter_title: z.string().max(300).nullable(),
    twitter_description: z.string().max(500).nullable(),
    meta_title: z.string().max(300).nullable(),
    meta_description: z.string().max(500).nullable(),
    codeinjection_head: z.string().max(65535).nullable(),
    codeinjection_foot: z.string().max(65535).nullable(),
    canonical_url: z.string().max(2000).nullable()
});

export type TagObject = z.infer<typeof tagZodSchema>;

export type TagDataObject = {
    data: TagObject;
};

export default class TagContext extends MigrateBase {
    #context;
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

        this.schema = tagZodSchema;
        this.initializeData();

        // Set initial data if provided
        Object.entries(initialData).forEach((item: any) => {
            const [key, value] = item;
            this.data[key] = value;
        });
    }

    async save(db: DatabaseModels) {
        const tagData = JSON.stringify(this.data);

        if (this.dbId) {
            await db.Tag.update({
                data: tagData,
                slug: this.data.slug,
                name: this.data.name
            }, {where: {id: this.dbId}});
        } else {
            const existing = this.data.slug ? await db.Tag.findOne({where: {slug: this.data.slug}}) : null;

            if (existing) {
                await existing.update({
                    data: tagData,
                    name: this.data.name
                });
                this.dbId = existing.get('id') as number;
            } else {
                const row = await db.Tag.create({
                    data: tagData,
                    slug: this.data.slug,
                    name: this.data.name
                });
                this.dbId = row.get('id') as number;
            }
        }
    }

    static fromRow(row: any): TagContext {
        const data = JSON.parse(row.get('data'));
        const tag = new TagContext(data);
        tag.dbId = row.get('id') as number;
        return tag;
    }
}
