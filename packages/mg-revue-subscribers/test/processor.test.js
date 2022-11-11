import processor from '../lib/processor.js';

import fixture from './fixtures/api-response.json';

describe('Process', function () {
    test('Can convert subscribers', function () {
        const ctx = {
            result: fixture
        };
        const response = processor.all(ctx);
        const subscribers = response.subscribers;

        expect(subscribers).toBeArrayOfSize(21);

        expect(subscribers[0].email).toEqual('herroooo@revue.com');
        expect(subscribers[0].name).toEqual('herroooo');
        expect(subscribers[0].labels).toBeArrayOfSize(0);

        expect(subscribers[4].email).toEqual('Bob.Something@advisers.co.uk');
        expect(subscribers[4].name).toEqual('Bob Something');
        expect(subscribers[4].labels).toBeArrayOfSize(0);
    });

    test('Can add a label', function () {
        const ctx = {
            result: fixture,
            options: {
                addLabel: 'Newsletter'
            }
        };
        const response = processor.all(ctx);
        const subscribers = response.subscribers;

        expect(subscribers).toBeArrayOfSize(21);

        expect(subscribers[0].email).toEqual('herroooo@revue.com');
        expect(subscribers[0].name).toEqual('herroooo');
        expect(subscribers[0].labels).toBeArrayOfSize(1);
        expect(subscribers[0].labels[0]).toEqual('Newsletter');

        expect(subscribers[4].email).toEqual('Bob.Something@advisers.co.uk');
        expect(subscribers[4].name).toEqual('Bob Something');
        expect(subscribers[4].labels).toBeArrayOfSize(1);
        expect(subscribers[4].labels[0]).toEqual('Newsletter');
    });
});
