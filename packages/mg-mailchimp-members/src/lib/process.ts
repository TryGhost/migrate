import fsUtils from '@tryghost/mg-fs-utils';

type memberObject = {
    email: string;
    name: string | null;
    note: string | null;
    subscribed_to_emails: boolean;
    stripe_customer_id: string | null;
    complimentary_plan: boolean;
    labels: string[];
    created_at: Date;
};

type processDataOptions = {
    pathToCsv?: string;
    pathToZip?: string;
    csvContent?: string;
    addLabel?: string | null;
    includeUnsubscribed: boolean;
}

type processCsvOptions = {
    pathToCsv?: string | string[];
    pathToZip?: string;
    addLabel?: string | null;
    includeUnsubscribed: boolean
}

const processData = async ({pathToCsv, pathToZip, csvContent, addLabel, includeUnsubscribed = true}: processDataOptions) => {
    const csvData = (csvContent) ? await fsUtils.csv.parseString(csvContent) : await fsUtils.csv.parseCSV(pathToCsv);

    let theMembers: memberObject[] = [];

    csvData.forEach((member: any) => {
        // Completely skip unsubscribed members
        if (!includeUnsubscribed && member?.UNSUB_TIME) {
            return;
        }

        const createdAt = new Date(member.created_at);

        let newMember: memberObject = {
            email: member['Email Address'],
            name: null,
            note: null,
            subscribed_to_emails: false,
            stripe_customer_id: null,
            complimentary_plan: false,
            labels: [],
            created_at: createdAt
        };

        if (member['First Name'] || member['Last Name']) {
            let allNames: string[] = [];

            if (member['First Name']) {
                allNames.push(member['First Name'].trim());
            }

            if (member['Last Name']) {
                allNames.push(member['Last Name'].trim());
            }

            newMember.name = allNames.join(' ');
        }

        if (addLabel) {
            let labels = addLabel.replace(/"/g, '').split(',');

            labels.forEach((label: string) => {
                newMember.labels.push(label.trim());
            });
        }

        if (member?.TAGS) {
            let tags = member.TAGS.replace(/"/g, '').split(',');

            tags.forEach((tag: string) => {
                newMember.labels.push(tag.trim());
            });
        }

        if (member?.CONFIRM_TIME) {
            newMember.created_at = new Date(member.CONFIRM_TIME);
        }

        if (member?.UNSUB_TIME) {
            newMember.subscribed_to_emails = false;
            newMember.labels.push(`mailchimp-unsubscribed`);
            newMember.note = `Unsubscribed to emails on ${member.UNSUB_TIME}`;
        } else {
            newMember.subscribed_to_emails = true;
        }

        theMembers.push(newMember);
    });

    return theMembers;
};

const processCsv = async ({pathToCsv, pathToZip, addLabel, includeUnsubscribed = true}: processCsvOptions) => {
    const newObj: memberObject[] = [];

    if (pathToZip) {
        const zipEntries: any = [];

        fsUtils.zip.read(pathToZip, (entryName: any, zipEntry: any) => {
            if (/\.csv$/.test(entryName)) {
                zipEntries.push({
                    name: entryName,
                    data: zipEntry.getData().toString('utf8')
                });
            }
        });

        for (const entry of zipEntries) {
            let pro = await processData({
                csvContent: entry.data,
                includeUnsubscribed: false
            });

            newObj.push(...pro);
        }
    } else if (pathToCsv) {
        const paths: string[] = (typeof pathToCsv === 'string') ? [pathToCsv] : pathToCsv;

        for (const list of paths) {
            let processed: any = await processData({
                pathToCsv: list,
                addLabel,
                includeUnsubscribed
            });

            newObj.push(...processed);
        }
    }

    return newObj;
};

export {
    processCsv
};
