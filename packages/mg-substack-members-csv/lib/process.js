const processCompGift = (member, {thresholdYearOrDate, beforeThreshold}) => {
    const sType = member.type;
    const thresholdDate = (typeof thresholdYearOrDate?.getMonth === 'function') ? thresholdYearOrDate : new Date().setFullYear(new Date().getFullYear() + thresholdYearOrDate);

    if (new Date(member.expiry) > thresholdDate) {
        member.type = 'comp',
        member.complimentary_plan = true;
        member.stripe_customer_id = null;
        member.note = `Substack expiry date: ${member.expiry.toISOString()}`;
        member.info = `${sType} member after threshold - importing as complimentary: ${member.email}`;
        member.labels = [`exp-${member.expiry.getFullYear()}-${('00' + (member.expiry.getMonth() + 1)).slice(-2)}`];
    } else if (beforeThreshold === 'none') {
        member.type = 'skip';
        member.info = `${sType} member below threshold - skipping: ${member.email}`;
    } else {
        member.type = beforeThreshold;
        if (member.stripe_customer_id) {
            member.note = `Previous Stripe Customer ID: ${member.stripe_customer_id}`;
            member.stripe_customer_id = null;
        }
        member.info = `${sType} member below threshold - importing as '${beforeThreshold}': ${member.email}`;
    }
    return member;
};

const processOptions = (member, options) => {
    const {comp, gift} = options;

    if (member.type === 'skip') {
        return member;
    }

    if (member.type === 'comp') {
        member = processCompGift(member, comp);
        member.labels.push(options.compLabel);
    } else if (member.type === 'gift') {
        member = processCompGift(member, gift);
        member.labels.push(options.giftLabel);
    } else if (member.type === 'paid') {
        member.labels.push(options.paidLabel);
    } else {
        member.labels.push(options.freeLabel);
    }

    // Combine the array of labels into a comma-separated string
    member.labels = member.labels.join(', ');

    return member;
};

const processMember = (sMember, options) => {
    let member = {
        email: sMember.email,
        // Substack exports email subscriptions preferences the opposite way of how we need it
        subscribed_to_emails: sMember.email_disabled === 'true' ? false : true,
        complimentary_plan: false,
        stripe_customer_id: sMember.stripe_customer_id ? sMember.stripe_customer_id : null,
        created_at: new Date(sMember.created_at) || new Date(),
        expiry: sMember.expiry ? new Date(sMember.expiry) : null,
        type: sMember.type,
        labels: []
    };

    if (member.type === 'free' && member.stripe_customer_id) {
        member.note = `Previous Stripe Customer ID: ${member.stripe_customer_id}`;
        member.stripe_customer_id = null;
        member.info = member.note;
    }

    // possible group members with type `paid`, but no Stripe ID
    if (member.type === 'paid' && !member.stripe_customer_id) {
        member.type = 'free';
        member.labels.push('Possible Group Membership');
        member.info = `possible group membership: ${member.email}`;
    }

    if (member?.email?.match(/@deletion-request.substack.com$/ig)) {
        member.type = 'skip';
        member.info = `deletion request - skipping: ${member.email}`;
    }

    return processOptions(member, options);
};

export const parseCompGift = (val) => {
    if (typeof val !== 'string') {
        return val;
    }

    let [yearsOrDate, before] = val.split(':');

    try {
        if (yearsOrDate.length >= 4) {
            yearsOrDate = new Date(yearsOrDate.replace(/([0-9]{4})([0-9]{2})([0-9]{2})/, `$1-$2-$3T12:00:00+0000`));
        } else {
            yearsOrDate = parseInt(yearsOrDate);
        }
    } catch (error) {
        console.log('Failed to parse passed in date/years for threshold, falling back to 10. Ensure the correct format'); // eslint-disable-line no-console
        yearsOrDate = 10;
    }
    return {
        thresholdYearOrDate: yearsOrDate,
        beforeThreshold: before
    };
};

export default async (input, ctx) => {
    const {options} = ctx;
    ctx.logs = [];

    if (options.subs) {
        options.hasSubscribers = true;
    }

    options.comp = parseCompGift(options.comp);
    options.gift = parseCompGift(options.gift);

    const processed = await input.map(member => processMember(member, options));

    // format the returned array into an object, using the assigned member.type
    // as a key:
    // {
    //   free: [{},{},...],
    //   comp: [{},{},...],
    //   paid: [{},{},...],
    //   skip: [{},{},...],
    // }
    const output = processed.reduce(function reduceByType(acc, obj) {
        let key = obj.type;
        if (!acc[key]) {
            acc[key] = [];
        }
        if (obj.info) {
            // write all changes done into our logs
            ctx.logs.push({
                info: obj.info,
                member: obj.email,
                expiry: obj.expiry
            });
        }
        acc[key].push(obj);
        return acc;
    }, {});

    return output;
};
