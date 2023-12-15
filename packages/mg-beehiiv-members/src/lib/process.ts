import fsUtils from '@tryghost/mg-fs-utils';

type memberObject = {
    email: string;
    name: string | null;
    note: string | null;
    subscribed_to_emails: boolean;
    stripe_customer_id: string;
    complimentary_plan: boolean;
    labels: string[] | null;
    created_at: Date;
};

const processCsv = async ({csvPath}: {csvPath: string}) => {
    const csvData = await fsUtils.csv.parseCSV(csvPath);

    const newObj: memberObject[] = [];

    csvData.forEach((member: any) => {
        const createdAt = new Date(member.created_at);

        let newMember: memberObject = {
            email: member.email,
            name: null,
            note: null,
            subscribed_to_emails: false,
            stripe_customer_id: '',
            complimentary_plan: false,
            labels: [],
            created_at: createdAt
        };

        if (member.status === 'active') {
            newMember.subscribed_to_emails = true;
        }

        if (member.tier === 'premium') {
            newMember.stripe_customer_id = 'auto';
        }

        if (newMember.labels) {
            newMember.labels.push(`beehiiv-status-${member.status}`);
            newMember.labels.push(`beehiiv-tier-${member.tier}`);
        }

        newObj.push(newMember);
    });

    return newObj;
};

export {
    processCsv
};
