const processSubscriber = (subscriber, options) => {
    const addLabel = options?.addLabel ?? false;

    let member = {
        email: subscriber.email,
        name: [subscriber.first_name, subscriber.last_name].join(' ').trim(),
        created_at: subscriber.last_changed,
        labels: []
    };

    if (addLabel) {
        member.labels.push(addLabel);
    }

    return member;
};

const processSubscribers = (subscribers, options) => {
    return subscribers.map(post => processSubscriber(post, options));
};

const all = ({result, options}) => {
    const output = {
        subscribers: processSubscribers(result.subscribers, options)
    };

    return output;
};

export default {
    processSubscriber,
    processSubscribers,
    all
};
