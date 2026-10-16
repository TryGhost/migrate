import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {fingerprintContentIdentity} from '../lib/content-identity.js';

const identity = {
    source: 'wordpress-export:example.xml',
    revision: 'sha256:source-v1',
    options: {shortcodes: true, image: {mode: 'download', sizes: [320, 640]}, empty: null}
};

describe('content identity', () => {
    it('hashes all content inputs with stable JSON key ordering', () => {
        const fingerprint = fingerprintContentIdentity(identity);
        assert.match(fingerprint, /^sha256:[a-f0-9]{64}$/);
        assert.equal(
            fingerprintContentIdentity({
                revision: identity.revision,
                source: identity.source,
                options: {empty: null, image: {sizes: [320, 640], mode: 'download'}, shortcodes: true}
            }),
            fingerprint
        );
        assert.equal(
            fingerprintContentIdentity({
                ...identity,
                options: {...identity.options, image: {mode: 'download', sizes: [640, 320]}}
            }) === fingerprint,
            false
        );
        for (const field of ['source', 'revision'] as const) {
            assert.notEqual(
                fingerprintContentIdentity({...identity, [field]: `${identity[field]}-changed`}),
                fingerprint
            );
        }
        assert.notEqual(fingerprintContentIdentity({...identity, options: undefined}), fingerprint);
        assert.equal(
            fingerprintContentIdentity({...identity, options: undefined}),
            fingerprintContentIdentity({...identity, options: {}})
        );
    });

    it('rejects incomplete and invalid identities', () => {
        assert.throws(() => fingerprintContentIdentity({...identity, unexpected: 'ignored'} as any), {
            name: 'BadRequestError',
            message: 'Unknown content identity field: unexpected.'
        });
        for (const field of ['source', 'revision'] as const) {
            assert.throws(() => fingerprintContentIdentity({...identity, [field]: ' '}), {
                name: 'BadRequestError',
                message: `Content identity requires a non-empty ${field}.`
            });
            assert.throws(() => fingerprintContentIdentity({...identity, [field]: 3} as any), {
                name: 'BadRequestError',
                message: `Content identity requires a non-empty ${field}.`
            });
        }
        assert.throws(() => fingerprintContentIdentity(null as any), {name: 'BadRequestError'});
        assert.throws(() => fingerprintContentIdentity({...identity, transformVersion: 'old'} as any), {
            name: 'BadRequestError',
            message: 'Unknown content identity field: transformVersion.'
        });
        for (const options of [null, [], 'invalid', new Date()] as any[]) {
            assert.throws(() => fingerprintContentIdentity({...identity, options}), {
                name: 'BadRequestError',
                message: 'Content identity options must be a plain JSON object.'
            });
        }
        assert.match(
            fingerprintContentIdentity({...identity, options: Object.assign(Object.create(null), {enabled: false})}),
            /^sha256:/
        );
    });

    it('rejects non-JSON option values and cycles', () => {
        for (const value of [undefined, Symbol('invalid'), () => true, Number.NaN, Infinity]) {
            assert.throws(() => fingerprintContentIdentity({...identity, options: {value} as any}), {
                name: 'BadRequestError',
                message: 'Content identity options must contain only JSON values.'
            });
        }
        assert.throws(() => fingerprintContentIdentity({...identity, options: {value: new Date()} as any}), {
            name: 'BadRequestError',
            message: 'Content identity options must contain only plain JSON objects.'
        });
        const options: Record<string, unknown> = {};
        options.self = options;
        assert.throws(() => fingerprintContentIdentity({...identity, options: options as any}), {
            name: 'BadRequestError',
            message: 'Content identity options cannot contain cycles.'
        });
        const sparse: unknown[] = [];
        sparse.length = 2;
        sparse[1] = 'valid';
        assert.throws(() => fingerprintContentIdentity({...identity, options: {sparse} as any}), {
            name: 'BadRequestError',
            message: 'Content identity options cannot contain sparse arrays.'
        });
    });
});
