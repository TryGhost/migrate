import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {extractName, mapSubscription, mapSubscriptions, mapMembersTasks} from '../lib/mapper.js';

describe('beehiiv API Members Mapper', () => {
    describe('extractName', () => {
        it('combines first and last name', () => {
            const customFields = [
                {name: 'first_name', value: 'John'},
                {name: 'last_name', value: 'Doe'}
            ];
            assert.equal(extractName(customFields), 'John Doe');
        });

        it('handles only first name', () => {
            const customFields = [{name: 'first_name', value: 'Jane'}];
            assert.equal(extractName(customFields), 'Jane');
        });

        it('handles only last name', () => {
            const customFields = [{name: 'last_name', value: 'Smith'}];
            assert.equal(extractName(customFields), 'Smith');
        });

        it('returns null for empty custom fields', () => {
            assert.equal(extractName([]), null);
        });

        it('returns null when name fields are empty strings', () => {
            const customFields = [
                {name: 'first_name', value: ''},
                {name: 'last_name', value: ''}
            ];
            assert.equal(extractName(customFields), null);
        });

        it('trims whitespace from names', () => {
            const customFields = [
                {name: 'first_name', value: '  John  '},
                {name: 'last_name', value: '  Doe  '}
            ];
            assert.equal(extractName(customFields), 'John Doe');
        });

        it('handles alternate field names (firstname/lastname)', () => {
            const customFields = [
                {name: 'firstname', value: 'Jane'},
                {name: 'lastname', value: 'Doe'}
            ];
            assert.equal(extractName(customFields), 'Jane Doe');
        });

        it('handles case-insensitive field names', () => {
            const customFields = [
                {name: 'First_Name', value: 'Jane'},
                {name: 'Last_Name', value: 'Doe'}
            ];
            assert.equal(extractName(customFields), 'Jane Doe');
        });
    });

    describe('mapSubscription', () => {
        const baseSubscription: BeehiivSubscription = {
            id: 'sub-123',
            email: 'test@example.com',
            status: 'active',
            created: 1704067200, // 2024-01-01 00:00:00 UTC
            subscription_tier: 'free',
            subscription_premium_tier_names: [],
            stripe_customer_id: null,
            custom_fields: [],
            tags: []
        };

        it('maps basic subscription fields', () => {
            const result = mapSubscription(baseSubscription);

            assert.equal(result.email, 'test@example.com');
            assert.equal(result.name, null);
            assert.equal(result.note, null);
            assert.equal(result.subscribed_to_emails, true);
            assert.equal(result.stripe_customer_id, '');
            assert.equal(result.complimentary_plan, false);
            assert.deepEqual(result.created_at, new Date(1704067200 * 1000));
        });

        it('sets subscribed_to_emails true for active status', () => {
            const subscription = {...baseSubscription, status: 'active' as const};
            const result = mapSubscription(subscription);
            assert.equal(result.subscribed_to_emails, true);
        });

        it('sets subscribed_to_emails false for inactive status', () => {
            const subscription = {...baseSubscription, status: 'inactive' as const};
            const result = mapSubscription(subscription);
            assert.equal(result.subscribed_to_emails, false);
        });

        it('sets subscribed_to_emails false for validating status', () => {
            const subscription = {...baseSubscription, status: 'validating' as const};
            const result = mapSubscription(subscription);
            assert.equal(result.subscribed_to_emails, false);
        });

        it('sets subscribed_to_emails false for pending status', () => {
            const subscription = {...baseSubscription, status: 'pending' as const};
            const result = mapSubscription(subscription);
            assert.equal(result.subscribed_to_emails, false);
        });

        it('maps stripe_customer_id when present', () => {
            const subscription = {...baseSubscription, stripe_customer_id: 'cus_abc123'};
            const result = mapSubscription(subscription);
            assert.equal(result.stripe_customer_id, 'cus_abc123');
        });

        it('sets complimentary_plan true for premium without stripe_customer_id', () => {
            const subscription = {
                ...baseSubscription,
                subscription_tier: 'premium' as const,
                stripe_customer_id: null
            };
            const result = mapSubscription(subscription);
            assert.equal(result.complimentary_plan, true);
        });

        it('sets complimentary_plan false for premium with stripe_customer_id', () => {
            const subscription = {
                ...baseSubscription,
                subscription_tier: 'premium' as const,
                stripe_customer_id: 'cus_abc123'
            };
            const result = mapSubscription(subscription);
            assert.equal(result.complimentary_plan, false);
        });

        it('sets complimentary_plan false for free tier', () => {
            const subscription = {...baseSubscription, subscription_tier: 'free' as const};
            const result = mapSubscription(subscription);
            assert.equal(result.complimentary_plan, false);
        });

        it('extracts name from custom_fields', () => {
            const subscription = {
                ...baseSubscription,
                custom_fields: [
                    {name: 'first_name', value: 'John'},
                    {name: 'last_name', value: 'Doe'}
                ]
            };
            const result = mapSubscription(subscription);
            assert.equal(result.name, 'John Doe');
        });

        it('adds status label', () => {
            const result = mapSubscription(baseSubscription);
            assert.ok(result.labels.includes('beehiiv-status-active'));
        });

        it('adds tier label', () => {
            const result = mapSubscription(baseSubscription);
            assert.ok(result.labels.includes('beehiiv-tier-free'));
        });

        it('adds premium tier names as labels', () => {
            const subscription = {
                ...baseSubscription,
                subscription_tier: 'premium' as const,
                subscription_premium_tier_names: ['Gold Plan', 'VIP Access']
            };
            const result = mapSubscription(subscription);
            assert.ok(result.labels.includes('beehiiv-premium-gold-plan'));
            assert.ok(result.labels.includes('beehiiv-premium-vip-access'));
        });

        it('adds tags as labels', () => {
            const subscription = {
                ...baseSubscription,
                tags: ['Newsletter', 'Tech Updates']
            };
            const result = mapSubscription(subscription);
            assert.ok(result.labels.includes('beehiiv-tag-newsletter'));
            assert.ok(result.labels.includes('beehiiv-tag-tech-updates'));
        });

        it('handles empty premium tier names array', () => {
            const subscription = {
                ...baseSubscription,
                subscription_premium_tier_names: []
            };
            const result = mapSubscription(subscription);
            assert.ok(!result.labels.some(l => l.startsWith('beehiiv-premium-')));
        });

        it('handles empty tags array', () => {
            const subscription = {
                ...baseSubscription,
                tags: []
            };
            const result = mapSubscription(subscription);
            assert.ok(!result.labels.some(l => l.startsWith('beehiiv-tag-')));
        });

        it('handles undefined custom_fields', () => {
            const subscription = {
                ...baseSubscription,
                custom_fields: undefined as any
            };
            const result = mapSubscription(subscription);
            assert.equal(result.name, null);
        });
    });

    describe('mapSubscriptions', () => {
        it('splits subscriptions into free and paid based on stripe_customer_id', () => {
            const subscriptions: BeehiivSubscription[] = [
                {
                    id: 'sub-1',
                    email: 'free@test.com',
                    status: 'active',
                    created: 1704067200,
                    subscription_tier: 'free',
                    subscription_premium_tier_names: [],
                    stripe_customer_id: null,
                    custom_fields: [],
                    tags: []
                },
                {
                    id: 'sub-2',
                    email: 'paid@test.com',
                    status: 'active',
                    created: 1704067200,
                    subscription_tier: 'premium',
                    subscription_premium_tier_names: [],
                    stripe_customer_id: 'cus_paid123',
                    custom_fields: [],
                    tags: []
                }
            ];

            const result = mapSubscriptions(subscriptions);

            assert.equal(result.free.length, 1);
            assert.equal(result.paid.length, 1);
            assert.equal(result.free[0].email, 'free@test.com');
            assert.equal(result.paid[0].email, 'paid@test.com');
        });

        it('returns empty arrays for empty input', () => {
            const result = mapSubscriptions([]);
            assert.deepEqual(result, {free: [], paid: []});
        });

        it('categorizes complimentary premium as free', () => {
            const subscriptions: BeehiivSubscription[] = [
                {
                    id: 'sub-1',
                    email: 'comp@test.com',
                    status: 'active',
                    created: 1704067200,
                    subscription_tier: 'premium',
                    subscription_premium_tier_names: [],
                    stripe_customer_id: null, // No stripe ID means complimentary
                    custom_fields: [],
                    tags: []
                }
            ];

            const result = mapSubscriptions(subscriptions);

            assert.equal(result.free.length, 1);
            assert.equal(result.paid.length, 0);
            assert.equal(result.free[0].complimentary_plan, true);
        });
    });

    describe('mapMembersTasks', () => {
        it('creates a single mapping task', () => {
            const ctx = {result: {subscriptions: []}};
            const tasks = mapMembersTasks({}, ctx);

            assert.equal(tasks.length, 1);
            assert.equal(tasks[0].title, 'Mapping subscriptions to Ghost member format');
        });

        it('task maps subscriptions and stores result', async () => {
            const ctx: any = {
                result: {
                    subscriptions: [
                        {
                            id: 'sub-1',
                            email: 'test@test.com',
                            status: 'active',
                            created: 1704067200,
                            subscription_tier: 'free',
                            subscription_premium_tier_names: [],
                            stripe_customer_id: null,
                            custom_fields: [],
                            tags: []
                        }
                    ]
                }
            };

            const tasks = mapMembersTasks({}, ctx);
            const mockTask = {output: ''};
            await tasks[0].task({}, mockTask);

            assert.ok(ctx.result.members);
            assert.equal(ctx.result.members.free.length, 1);
            assert.equal(ctx.result.members.paid.length, 0);
            assert.ok(mockTask.output.includes('1 free'));
            assert.ok(mockTask.output.includes('0 paid'));
        });

        it('task handles empty subscriptions', async () => {
            const ctx: any = {result: {subscriptions: []}};

            const tasks = mapMembersTasks({}, ctx);
            const mockTask = {output: ''};
            await tasks[0].task({}, mockTask);

            assert.deepEqual(ctx.result.members, {free: [], paid: []});
        });

        it('task handles undefined subscriptions', async () => {
            const ctx: any = {result: {}};

            const tasks = mapMembersTasks({}, ctx);
            const mockTask = {output: ''};
            await tasks[0].task({}, mockTask);

            assert.deepEqual(ctx.result.members, {free: [], paid: []});
        });

        it('task sets error output on failure with Error instance', async () => {
            const ctx = {
                result: {
                    subscriptions: 'not an array' // Invalid data
                }
            };

            const tasks = mapMembersTasks({}, ctx);
            const mockTask = {output: ''};

            await assert.rejects(async () => {
                await tasks[0].task({}, mockTask);
            });

            assert.ok(mockTask.output.length > 0);
        });

        it('task sets error output on failure with non-Error thrown', async () => {
            // Create a context that will trigger an error through a getter that throws a string
            const ctx: any = {
                result: {
                    get subscriptions() {
                        // eslint-disable-next-line no-throw-literal
                        throw 'Custom string error';
                    }
                }
            };

            const tasks = mapMembersTasks({}, ctx);
            const mockTask = {output: ''};

            await assert.rejects(async () => {
                await tasks[0].task({}, mockTask);
            });

            assert.equal(mockTask.output, 'Custom string error');
        });
    });
});
