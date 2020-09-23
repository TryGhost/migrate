const {
    isDate,
    parseISO,
    formatISO,
    addYears,
    isAfter
} = require('date-fns');

const processCompGift = (member, {thresholdYearOrDate, beforeThreshold}) => {
    const sType = member.type;
    const thresholdDate = isDate(thresholdYearOrDate) ? thresholdYearOrDate : addYears(new Date(), thresholdYearOrDate);

    if (isAfter(member.expiry, thresholdDate)) {
        member.type = 'comp',
        member.complimentary_plan = true;
        member.stripe_customer_id = null;
        member.note = `Substack expiry date: ${formatISO(member.expiry)}`;
        member.reason = `${sType} member after threshold - importing as complimentary: ${member.email}`;
    } else if (beforeThreshold === 'none') {
        member.type = 'skip';
        member.reason = `${sType} member below threshold - skipping: ${member.email}`;
    } else {
        member.type = beforeThreshold;
        member.reason = `${sType} member below threshold - importing as '${beforeThreshold}': ${member.email}`;
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
        member.labels = options.compLabel;
    } else if (member.type === 'gift') {
        member = processCompGift(member, gift);
        member.labels = options.giftLabel;
    } else if (member.type === 'paid') {
        member.labels = options.paidLabel;
    } else {
        member.labels = options.freeLabel;
    }

    return member;
};

const processMember = (sMember, options) => {
    let member = {
        email: sMember.email,
        // Substack exports email subscriptions preferences the opposite way of how we need it
        subscribed_to_emails: sMember.email_disabled === 'true' ? false : true,
        complimentary_plan: false,
        stripe_customer_id: sMember.stripe_customer_id ? sMember.stripe_customer_id : null,
        created_at: parseISO(sMember.created_at) || parseISO(new Date()),
        expiry: parseISO(sMember.expiry) || null,
        type: sMember.type
    };

    // possible group members with type `paid`, but no Stripe ID
    if (member.type === 'paid' && !member.stripe_customer_id) {
        member.type = 'free';
        member.reason = `possible group membership: ${member.email}`;
    }

    if (member.email.match(/@deletion-request.substack.com$/ig)) {
        member.type = 'skip';
        member.reason = `deletion request - skipping: ${member.email}`;
    }

    return processOptions(member, options);
};

module.exports = async (input, ctx) => {
    const {options} = ctx;
    ctx.logs = [];

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
        if (obj.reason) {
            // write all changes done into our logs
            ctx.logs.push({
                info: obj.reason,
                member: obj.email,
                expiry: obj.expiry
            });
        }
        acc[key].push(obj);
        return acc;
    }, {});

    return output;
};
