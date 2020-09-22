const parse = require('@tryghost/mg-fs-utils/lib/parse-csv');

module.exports = async (ctx) => {
    let parsed = await parse(ctx.options.pathToFile);
    let subscribers = [];

    if (ctx.hasSubscribers) {
        subscribers = await parse(ctx.options.subs);
    }

    parsed = parsed.map((signup) => {
        if (subscribers.length && signup.active_subscription) {
            // Find the subscription information in the passed in subscriber export and
            // add the relevant data to our results
            const subscriberData = subscribers.find(subscriber => subscriber.email === signup.email);
            signup.stripe_customer_id = subscriberData.stripe_connected_customer_id;
            signup.type = subscriberData.type;
        } else {
            signup.stripe_customer_id = null;
            signup.type = 'free';
        }
        return signup;
    });

    return parsed;
};
