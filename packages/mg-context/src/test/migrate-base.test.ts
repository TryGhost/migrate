// In here, we're testing that MigrateBase can be extended and used as intended

import {z} from 'zod/v4';
// import MigrateBase from '../lib/MigrateBase.js';
import {MigrateBase} from '../index.js';
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

const testSchema = z.object({
    name: z.string().max(20),
    slug: z.string().max(10),
    html: z.string().max(1000000000).nullable(),
    mobiledoc: z.string().max(1000000000).nullable(),
    lexical: z.string().max(1000000000).nullable(),
    created_at: z.date().nullable(),
    role: z.enum(['Contributor', 'Author', 'Editor', 'Administrator']),
    list: z.array(z.any()).default([]),
    featured: z.boolean().default(false),
    shouty: z
        .string()
        .max(50)
        .refine(val => val === val.toUpperCase(), {message: 'Must be uppercase'})
        .nullable()
});

class TestContext extends MigrateBase {
    data: any = {};

    constructor({initialData = {}} = {}) {
        super();

        this.schema = testSchema;
        this.initializeData();

        // Set initial data if provided
        Object.entries(initialData).forEach((item: any) => {
            const [key, value] = item;
            this.data[key] = value;
        });
    }
}

describe('MigrateBase', () => {
    it('Is instance of MigrateBase', () => {
        const instance: any = new MigrateBase();
        assert.equal(instance instanceof MigrateBase, true);
    });

    it('Can extend of MigrateBase', () => {
        const instance: any = new TestContext();
        assert.equal(instance instanceof TestContext, true);
    });

    it('TestContext has all keys from schema', () => {
        const instance: any = new TestContext();
        assert.deepEqual(Object.keys(instance.data), [
            'name',
            'slug',
            'html',
            'mobiledoc',
            'lexical',
            'created_at',
            'role',
            'list',
            'featured',
            'shouty'
        ]);
    });

    it('Can set individual key', () => {
        const instance: any = new TestContext();
        instance.set('name', 'Test');
        assert.equal(instance.data.name, 'Test');
    });

    it('Can set multiple keys to a single value by array', () => {
        const instance: any = new TestContext();
        instance.set(['name', 'slug'], 'test');
        assert.equal(instance.data.name, 'test');
        assert.equal(instance.data.slug, 'test');
    });

    it('Can chain setting keys', () => {
        const instance: any = new TestContext();
        instance.set('name', 'Test').set('slug', 'test');
        assert.equal(instance.data.name, 'Test');
        assert.equal(instance.data.slug, 'test');
    });

    it('Can get individual value', () => {
        const instance: any = new TestContext();
        instance.set('name', 'Test');
        const theName = instance.get('name');
        assert.equal(theName, 'Test');
    });

    it('Will return final object', () => {
        const instance: any = new TestContext();
        instance.set('name', 'Test');
        instance.set('slug', 'test');
        instance.set('role', 'Author');
        const final = instance.getFinal;

        assert.deepEqual(final, {
            data: {
                name: 'Test',
                slug: 'test',
                html: null,
                mobiledoc: null,
                lexical: null,
                created_at: null,
                role: 'Author',
                list: [],
                featured: false,
                shouty: null
            }
        });
    });

    it('Will throw when setting a key that does not exist', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('lorem', 'Ipsum'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Property "lorem" is not allowed in TestContext'
        });
    });

    it('Truncates an over-long string value', async () => {
        const instance: any = new TestContext();

        instance.set('name', 'This Name Is Too Long To Be Valid');

        assert.equal(instance.data.name, 'This Name Is Too Lon');
    });

    it('Will throw in invalid type', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('created_at', 'Not a date'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Invalid date value for "created_at"'
        });
    });

    it('Will throw in invalid choice', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('role', 'DoesNotExist'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Invalid choice for "role"'
        });
    });

    it('Can push valid value to array', async () => {
        const instance: any = new TestContext();
        instance.set('list', ['hello', 'world']);

        assert.deepEqual(instance.data.list, ['hello', 'world']);
    });

    it('Will throw when setting string to array', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('list', 'dont do this'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Invalid array value for "list"'
        });
    });

    it('Will throw when setting string to boolean', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('featured', 'yes'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Invalid boolean value for "featured"'
        });
    });

    it('Will throw if required values are missing', async () => {
        const instance: any = new TestContext();

        instance.set('name', 'Test');
        instance.set('slug', 'Test');
        instance.set('created_at', new Date());
        // Don't set a `role` value to trigger the error

        assert.throws(() => instance.getFinal, {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Missing required field: "role"'
        });
    });

    it('Can remove a field with a default value', () => {
        const instance: any = new TestContext();
        instance.set('featured', true);
        assert.equal(instance.data.featured, true);

        instance.remove('featured');
        assert.equal(instance.data.featured, false);
    });

    it('Will throw when getting non-existent value', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.get('lorem'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Property "lorem" does not exist in TestContext'
        });
    });

    it('Will return undefined when validating non-existent property', async () => {
        const instance: any = new TestContext();
        const valid = instance.validate('lorem', 'ipsum');

        assert.equal(valid, undefined);
    });

    it('Will return undefined when validating property with no value', async () => {
        const instance: any = new TestContext();
        const valid = instance.validate('slug', undefined);

        assert.equal(valid, undefined);
    });

    it('Will throw when a schema refinement fails', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('shouty', 'not uppercase'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Must be uppercase for "shouty"'
        });
    });

    describe('sanitize', () => {
        it('Trims surrounding whitespace and records it', () => {
            const instance: any = new TestContext({initialData: {name: '  Padded  ', slug: 'ok'}});
            const collected: any[] = [];

            instance.sanitize(collected);

            assert.equal(instance.data.name, 'Padded');
            assert.equal(collected.length, 1);
            assert.deepEqual(
                {...collected[0]},
                {
                    context: 'TestContext',
                    slug: 'ok',
                    field: 'name',
                    reason: 'trimmed',
                    oldValue: '  Padded  ',
                    newValue: 'Padded'
                }
            );
        });

        it('Truncates over-long values and records them', () => {
            const instance: any = new TestContext({initialData: {name: 'a'.repeat(25), slug: 'ok'}});
            const collected: any[] = [];

            instance.sanitize(collected);

            assert.equal(instance.data.name, 'a'.repeat(20));
            assert.equal(collected.length, 1);
            assert.equal(collected[0].reason, 'truncated');
            assert.equal(collected[0].oldValue.length, 25);
        });

        it('Strips a dangling separator left by truncating a slug', () => {
            // Cutting at 10 chars lands on the separator: "abcdefghi-jk" -> "abcdefghi-"
            const instance: any = new TestContext({initialData: {name: 'ok', slug: 'abcdefghi-jk'}});

            instance.sanitize();

            assert.equal(instance.data.slug, 'abcdefghi');
        });

        it('Leaves non-string values alone', () => {
            const created = new Date('2023-01-01T00:00:00.000Z');
            const instance: any = new TestContext({
                initialData: {name: 'ok', slug: 'ok', created_at: created, featured: true, list: ['a']}
            });
            const collected: any[] = [];

            instance.sanitize(collected);

            assert.equal(instance.data.created_at, created);
            assert.equal(instance.data.featured, true);
            assert.deepEqual(instance.data.list, ['a']);
            assert.equal(collected.length, 0);
        });

        it('Records an empty slug when the entity has none', () => {
            const instance: any = new TestContext({initialData: {name: '  Padded  '}});
            const collected: any[] = [];

            instance.sanitize(collected);

            assert.equal(instance.data.slug, null);
            assert.equal(collected[0].slug, '');
        });

        it('Records nothing when every value is already valid', () => {
            const instance: any = new TestContext({initialData: {name: 'Fine', slug: 'fine'}});
            const collected: any[] = [];

            instance.sanitize(collected);

            assert.equal(collected.length, 0);
        });

        it('Buffers what set() sanitized until the next flush', () => {
            const instance: any = new TestContext({initialData: {slug: 'ok'}});

            instance.set('name', 'a'.repeat(25));
            assert.equal(instance.data.name, 'a'.repeat(20));

            const collected: any[] = [];
            instance.sanitize(collected);

            assert.equal(collected.length, 1);
            assert.equal(collected[0].field, 'name');
            assert.equal(collected[0].reason, 'truncated');

            // Flushed once, not repeated on the next pass
            const second: any[] = [];
            instance.sanitize(second);
            assert.equal(second.length, 0);
        });
    });
});
