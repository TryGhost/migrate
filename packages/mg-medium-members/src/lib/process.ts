import {readFile} from 'node:fs/promises';

type memberObject = {
    email: string;
    name: string | null;
    note: string | null;
    subscribed_to_emails: boolean;
    stripe_customer_id: string | boolean;
    complimentary_plan: boolean;
    labels: string[] | null;
    created_at: Date | boolean;
};

const processTxt = async ({txtPath}: {txtPath: string}) => {
    const txtData = await readFile(txtPath, 'utf8');
    const emailList = txtData.split('\n').filter(el => el !== '');

    const newObj: memberObject[] = [];

    emailList.forEach((member: any) => {
        let newMember: memberObject = {
            email: member,
            name: null,
            note: null,
            subscribed_to_emails: true,
            stripe_customer_id: false,
            complimentary_plan: false,
            labels: [],
            created_at: false
        };

        newObj.push(newMember);
    });

    return newObj;
};

export {
    processTxt
};
