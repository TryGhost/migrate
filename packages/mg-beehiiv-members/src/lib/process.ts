import fsUtils from '@tryghost/mg-fs-utils';

type memberObject = {
    email: string;
    name: string | null;
    note: string | null;
    subscribed_to_emails: boolean;
    stripe_customer_id: string;
    complimentary_plan: boolean;
    labels: string[];
    created_at: Date;
};

const processCsv = async ({csvPath}: {csvPath: string}) => {
    let csvData = await fsUtils.csv.parseCSV(csvPath);

    // Filter out unsubscribed members
    csvData = csvData.filter((member: any) => {
        return member.unsubscribed_at === null || member.unsubscribed_at.length === 0;
    });

    // Filter out inactive members
    csvData = csvData.filter((member: any) => {
        return member.status !== 'inactive';
    });

    const allMembers: {
        free: memberObject[];
        paid: memberObject[];
    } = {
        free: [],
        paid: []
    };

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

        // First Name,Last Name

        if (member['First Name'] || member['Last Name']) {
            const firstName = member?.['First Name']?.trim() || '';
            const lastName = member?.['Last Name']?.trim() || '';

            const combinedName = [firstName, lastName].filter(name => name.length > 0).join(' ');

            newMember.name = combinedName;
        }

        if (member.status) {
            newMember.labels.push(`beehiiv-status-${member.status}`);
        }

        if (member.status === 'active') {
            newMember.subscribed_to_emails = true;
        }

        if (member.stripe_customer_id) {
            newMember.stripe_customer_id = member.stripe_customer_id;
        } else if (member.tier === 'premium') {
            newMember.stripe_customer_id = 'auto';
        }

        if (member['Free Tier'] === 'Yes') {
            newMember.labels.push(`beehiiv-tier-free`);
        }

        if (member['Premium Tier'] === 'Yes') {
            newMember.labels.push(`beehiiv-premium-free`);
        }

        if (member.tier) {
            newMember.labels.push(`beehiiv-tier-${member.tier}`);
        }

        if (member.stripe_customer_id) {
            allMembers.paid.push(newMember);
        } else {
            allMembers.free.push(newMember);
        }
    });

    return allMembers;
};

export {
    processCsv
};
