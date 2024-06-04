// In here, we're testing that MigrateBase can be extended and used as intended

// import MigrateBase from '../lib/MigrateBase.js';
import {MigrateBase} from '../index.js';
import assert from 'node:assert/strict';

class TestContext extends MigrateBase {
    #schema;
    data: any = {};

    constructor({initialData = {}} = {}) {
        super();

        // Define what fields are allowed, their types, validations, and defaults
        this.#schema = {
            name: {required: true, type: 'string', maxLength: 20},
            slug: {required: true, type: 'string', maxLength: 10},
            html: {type: 'string', maxLength: 1000000000},
            mobiledoc: {type: 'string', maxLength: 1000000000},
            lexical: {type: 'string', maxLength: 1000000000},
            created_at: {type: 'dateTime'},
            role: {required: true, type: 'string', choices: ['Contributor', 'Author', 'Editor', 'Administrator']},
            list: {type: 'array', default: []},
            featured: {type: 'boolean', default: false}
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

    // get schema(): any {
    //     return this.#schema;
    // }
}

describe('MigrateBase', () => {
    test('Is instance of MigrateBase', () => {
        const instance: any = new MigrateBase();
        assert.equal(instance instanceof MigrateBase, true);
    });

    test('Can extend of MigrateBase', () => {
        const instance: any = new TestContext();
        assert.equal(instance instanceof TestContext, true);
    });

    test('TestContext has all keys from schema', () => {
        const instance: any = new TestContext();
        assert.deepEqual(Object.keys(instance.data), ['name', 'slug', 'html', 'mobiledoc', 'lexical', 'created_at', 'role', 'list', 'featured']);
    });

    test('Can set individual key', () => {
        const instance: any = new TestContext();
        instance.set('name', 'Test');
        assert.equal(instance.data.name, 'Test');
    });

    test('Can set multiple keys to a single value by array', () => {
        const instance: any = new TestContext();
        instance.set(['name', 'slug'], 'test');
        assert.equal(instance.data.name, 'test');
        assert.equal(instance.data.slug, 'test');
    });

    test('Can chain setting keys', () => {
        const instance: any = new TestContext();
        instance.set('name', 'Test').set('slug', 'test');
        assert.equal(instance.data.name, 'Test');
        assert.equal(instance.data.slug, 'test');
    });

    test('Can get individual value', () => {
        const instance: any = new TestContext();
        instance.set('name', 'Test');
        const theName = instance.get('name');
        assert.equal(theName, 'Test');
    });

    test('Will return final object', () => {
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
                featured: false
            }
        });
    });

    test('Will throw when setting a key that does not exist', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('lorem', 'Ipsum'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Property "lorem" is not allowed in TestContext'
        });
    });

    test('Will throw in invalid string length', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('name', 'This Name Is Too Long To Be Valid'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Value for "name" is too long. Currently 33 characters, Max 20.'
        });
    });

    test('Will throw in invalid type', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('created_at', 'Not a date'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Invalid date value for created_at'
        });
    });

    test('Will throw in invalid choice', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('role', 'DoesNotExist'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Invalid choice for role'
        });
    });

    test('Can push valid value to array', async () => {
        const instance: any = new TestContext();
        instance.set('list', ['hello', 'world']);

        assert.deepEqual(instance.data.list, ['hello', 'world']);
    });

    test('Will throw when setting string to array', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('list', 'dont do this'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Invalid array value for list'
        });
    });

    test('Will throw when setting string to boolean', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.set('featured', 'yes'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Invalid boolean value for featured'
        });
    });

    test('Will throw if required values are missing', async () => {
        const instance: any = new TestContext();

        instance.set('name', 'Test');
        instance.set('slug', 'Test');
        instance.set('created_at', new Date());
        // Don't set a `role` value to trigger the error

        assert.throws(() => instance.getFinal, {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Missing required field: role'
        });
    });

    test('Will throw when getting non-existent value', async () => {
        const instance: any = new TestContext();

        assert.throws(() => instance.get('lorem'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TestContext) Property "lorem" does not exist in TestContext'
        });
    });

    test('Will return undefined when validating non-existent property', async () => {
        const instance: any = new TestContext();
        const valid = instance.validate('lorem', 'ipsum');

        assert.equal(valid, undefined);
    });

    test('Will return undefined when validating property with no value', async () => {
        const instance: any = new TestContext();
        const valid = instance.validate('slug', undefined);

        assert.equal(valid, undefined);
    });
});
