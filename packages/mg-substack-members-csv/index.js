const parse = require('@tryghost/mg-fs-utils/lib/parse-csv');
const process = require('./lib/process');

module.exports = async (ctx) => {
    let parsed = await parse(ctx.options.pathToFile);
    let subscribers = [];

    if (ctx.hasSubscribers) {
        subscribers = await parse(ctx.options.subs);

        parsed = parsed.map((signup) => {
            if (signup.active_subscription) {
                const subscriberData = subscribers.find(subscriber => subscriber.email === signup.email);
                signup.stripe_customer_id = subscriberData.stripe_connected_customer_id;
                signup.type = subscriberData.type;
            } else {
                signup.stripe_customer_id = null;
                signup.type = 'free';
            }
            return signup;
        });
    }

    const normalized = await process(parsed, ctx.options);

    return normalized;
};
