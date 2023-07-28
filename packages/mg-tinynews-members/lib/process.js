const emailFields = ['Email', 'email'];
const firstNameFields = ['Name', 'First name'];
const lastNameFields = ['Surname', 'Last name'];
const createdAtFields = ['Created at', 'Date added'];
const statusFields = ['Status', 'status'];

const colMapper = (opts, obj) => {
    let keys = Object.keys(obj);

    let useThis;

    opts.forEach((opt) => {
        if (keys.includes(opt)) {
            useThis = obj[opt];
        }
    });

    return useThis;
};

const processMember = (tMember) => {
    const email = colMapper(emailFields, tMember);
    const firstName = colMapper(firstNameFields, tMember);
    const lastName = colMapper(lastNameFields, tMember);
    const createdAt = colMapper(createdAtFields, tMember);
    const status = colMapper(statusFields, tMember);

    let member = {
        email: email,
        name: [firstName, lastName].map(e => e.trim()).join(' ').trim(),
        complimentary_plan: false,
        created_at: new Date(createdAt), // Given values are UTC
        labels: ['tinynews'],
        subscribed_to_emails: false
    };

    if (tMember?.Tags) {
        member.labels = member.labels.concat(tMember.Tags.replace(/\|/gm, ',').split(',').filter(e => e).map(e => e.trim()));
    }

    if (status === 'Subscribed' || status === '1' || status === 1 || status === '2' || status === 2) {
        member.subscribed_to_emails = true;
    }

    return member;
};

export default async (input, ctx) => {
    const {options} = ctx;
    ctx.logs = [];

    const processed = await input.map(member => processMember(member, options));

    return processed;
};
