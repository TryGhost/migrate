import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    AuthorContext,
    GHOST_FIELD_LIMITS,
    GHOST_SCHEMA_SOURCE,
    GHOST_SCHEMA_VERSION,
    PostContext,
    TagContext
} from '../index.js';
import {getFieldInfo} from '../lib/zod-schema-utils.js';

describe('Ghost schema profile', () => {
    it('Identifies the exact authoritative Ghost schema revision', () => {
        assert.match(GHOST_SCHEMA_VERSION, /^[a-f0-9]{40}$/);
        assert.equal(GHOST_SCHEMA_SOURCE.includes(GHOST_SCHEMA_VERSION), true);
    });

    it('Uses Ghost validation limits instead of larger storage limits', () => {
        assert.equal(GHOST_FIELD_LIMITS.post.title, 255);
        assert.equal(GHOST_FIELD_LIMITS.post.custom_excerpt, 300);
        assert.equal(GHOST_FIELD_LIMITS.post.feature_image_alt, 191);
    });

    it('Drives every profiled context field from the generated limits', () => {
        const contexts = {
            post: new PostContext(),
            tag: new TagContext(),
            author: new AuthorContext()
        };

        for (const [context, limits] of Object.entries(GHOST_FIELD_LIMITS)) {
            const schema = contexts[context as keyof typeof contexts].schema;
            const limitedStringFields = Object.entries(schema.shape)
                .filter(([, fieldSchema]) => {
                    const info = getFieldInfo(fieldSchema as any);
                    return info.type === 'string' && info.maxLength !== undefined;
                })
                .map(([field]) => field)
                .sort();

            assert.deepEqual(Object.keys(limits).sort(), limitedStringFields, context);

            for (const [field, maximum] of Object.entries(limits)) {
                const fieldInfo = getFieldInfo(schema.shape[field]);
                assert.equal(fieldInfo.maxLength, maximum, `${context}.${field}`);
            }
        }
    });
});
