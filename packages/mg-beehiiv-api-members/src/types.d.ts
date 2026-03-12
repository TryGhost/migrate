declare module '@tryghost/errors';
declare module '@tryghost/mg-fs-utils';
declare module '@tryghost/string';

type BeehiivSubscription = {
    id: string;
    email: string;
    status: 'active' | 'inactive' | 'validating' | 'pending';
    created: number;
    subscription_tier: 'free' | 'premium';
    subscription_premium_tier_names: string[];
    stripe_customer_id: string | null;
    custom_fields: Array<{name: string; value: string}>;
    tags: string[];
};

type BeehiivPublicationResponse = {
    data: {
        stats: {
            active_subscriptions: number;
        }
    }
}

type BeehiivSubscriptionsResponse = {
    data: BeehiivSubscription[];
    total_results: number;
    has_more: boolean;
    next_cursor: string | null;
};

type GhostMemberObject = {
    email: string;
    name: string | null;
    note: string | null;
    subscribed_to_emails: boolean;
    stripe_customer_id: string;
    complimentary_plan: boolean;
    labels: string[];
    created_at: Date;
};

type MappedMembers = {
    free: GhostMemberObject[];
    paid: GhostMemberObject[];
};
