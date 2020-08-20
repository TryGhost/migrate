const processMember = (member, options) => {
    const processedMember = {
        email: member.email,
        subscribed_to_emails: member.email_disabled === 'false' ? true : false,
        complimentary_plan: false,
        stripe_customer_id: member.stripe_customer_id ? member.stripe_customer_id : null,
        created_at: member.created_at
    };

    switch (member.type) {
    case 'paid':
        processedMember.labels = options.paidLabel;
        break;
    case 'comp':
        processedMember.labels = options.compLabel;
        break;
    case 'gift':
        processedMember.labels = options.giftLabel;
        break;
    default:
        processedMember.labels = options.freeLabel;
        break;
    }
    console.log('processMember -> member', processedMember);

    return processedMember;
};

module.exports = async (input, options) => {
    console.log('processMember -> options', options);

    const output = input.map(member => processMember(member, options));

    return output;
};
