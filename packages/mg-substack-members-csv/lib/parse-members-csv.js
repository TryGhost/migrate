import fsUtils from '@tryghost/mg-fs-utils';

const parseCSV = fsUtils.csv.parseCSV;

export default async (ctx) => {
    const {options} = ctx;

    if (options.subs) {
        options.hasSubscribers = true;
    }

    let subscribers = [];

    // Grab the main file "signups"
    let parsed = await parseCSV(options.pathToFile);

    if (options.hasSubscribers) {
        // Grab the "subscribers" file if option is passed
        subscribers = await parseCSV(options.subs);
    }

    parsed = parsed.map((signup) => {
        if (subscribers.length && signup.active_subscription) {
            // Find the subscription information in the passed in subscriber export and
            // add the relevant data to our results
            const subscriberData = subscribers.find(subscriber => subscriber.email === signup.email);
            signup.stripe_customer_id = (subscriberData) ? subscriberData.stripe_connected_customer_id : null;
            signup.type = (subscriberData) ? subscriberData.type : 'free';
        } else {
            signup.stripe_customer_id = null;
            signup.type = 'free';
        }
        return signup;
    });

    return parsed;
};
