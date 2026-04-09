import {slugify} from '@tryghost/string';

const extractName = (customFields: Array<{name: string; value: string}>): string | null => {
    const firstNameField = customFields.find(f => f.name.toLowerCase() === 'first_name' || f.name.toLowerCase() === 'firstname');
    const lastNameField = customFields.find(f => f.name.toLowerCase() === 'last_name' || f.name.toLowerCase() === 'lastname');

    const firstName = firstNameField?.value?.trim() || '';
    const lastName = lastNameField?.value?.trim() || '';

    const combinedName = [firstName, lastName].filter(name => name.length > 0).join(' ');

    return combinedName.length > 0 ? combinedName : null;
};

const mapSubscription = (subscription: BeehiivSubscription): GhostMemberObject => {
    const labels: string[] = [];

    // Add status label
    labels.push(`beehiiv-status-${subscription.status}`);

    // Add tier label
    labels.push(`beehiiv-tier-${subscription.subscription_tier}`);

    // Add premium tier names as labels
    if (subscription.subscription_premium_tier_names && subscription.subscription_premium_tier_names.length > 0) {
        subscription.subscription_premium_tier_names.forEach((tierName: string) => {
            const slugifiedTier = slugify(tierName);
            labels.push(`beehiiv-premium-${slugifiedTier}`);
        });
    }

    // Add tags as labels
    if (subscription.tags && subscription.tags.length > 0) {
        subscription.tags.forEach((tag: string) => {
            const slugifiedTag = slugify(tag);
            labels.push(`beehiiv-tag-${slugifiedTag}`);
        });
    }

    // Determine if this is a complimentary plan
    // A member is on a complimentary plan if they have premium access but no Stripe customer ID
    const isPremium = subscription.subscription_tier === 'premium';
    const hasStripeId = Boolean(subscription.stripe_customer_id);
    const complimentaryPlan = isPremium && !hasStripeId;

    return {
        email: subscription.email,
        name: extractName(subscription.custom_fields || []),
        note: null,
        subscribed_to_emails: subscription.status === 'active',
        stripe_customer_id: subscription.stripe_customer_id || '',
        complimentary_plan: complimentaryPlan,
        labels,
        created_at: new Date(subscription.created * 1000)
    };
};

const mapSubscriptions = (subscriptions: BeehiivSubscription[]): MappedMembers => {
    const result: MappedMembers = {
        free: [],
        paid: []
    };

    subscriptions.forEach((subscription) => {
        const member = mapSubscription(subscription);

        if (member.stripe_customer_id) {
            result.paid.push(member);
        } else {
            result.free.push(member);
        }
    });

    return result;
};

export const mapMembersTasks = (_options: any, ctx: any) => {
    const tasks = [
        {
            title: 'Mapping subscriptions to Ghost member format',
            task: async (_: any, task: any) => {
                try {
                    const subscriptions: BeehiivSubscription[] = ctx.result.subscriptions || [];
                    ctx.result.members = mapSubscriptions(subscriptions);

                    const freeCount = ctx.result.members.free.length;
                    const paidCount = ctx.result.members.paid.length;

                    task.output = `Mapped ${freeCount} free and ${paidCount} paid members`;
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    task.output = errorMessage;
                    throw error;
                }
            }
        }
    ];

    return tasks;
};

export {
    extractName,
    mapSubscription,
    mapSubscriptions
};
