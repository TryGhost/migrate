const parse = require('@tryghost/mg-fs-utils/lib/csv').parse;

module.exports = async (ctx) => {
    const {options} = ctx;
    let subscribers = [];

    // grab the main file "signups"
    let parsed = await parse(options.pathToFile);

    if (options.hasSubscribers) {
        // grap the "subscribers" file if option is passed
        subscribers = await parse(options.subs);
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
