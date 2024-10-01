import {existsSync} from 'node:fs';
import errors from '@tryghost/errors';
import fsUtils from '@tryghost/mg-fs-utils';
const parseCSV = fsUtils.csv.parseCSV;

/**
 * Get basic stats on a Substack members CSV file
 * @param {object} data
 * @param {string} data.csvPath path to CSV file
 * @returns {object}
 */
const memberStats = async (args = {}) => {
    const {csvPath} = args;

    if (typeof csvPath !== 'string') {
        throw new errors.BadRequestError({message: 'No file path provided'});
    } else if (!existsSync(csvPath)) {
        throw new errors.BadRequestError({message: 'File not found'});
    }

    const isValid = await fsUtils.csv.hasKeys({
        filePath: csvPath,
        required: ['email', 'active_subscription', 'expiry', 'email_disabled', 'created_at'],
        blocked: ['stripe_connected_customer_id']
    });

    if (!isValid) {
        throw new errors.BadRequestError({message: 'File not valid'});
    }

    let csvData = await parseCSV(csvPath);

    const hasSubscription = csvData.filter(value => value.active_subscription === 'true').length;
    const noSubscription = csvData.filter(value => value.active_subscription !== 'true').length;

    return {
        allMembers: csvData.length,
        hasSubscription: hasSubscription,
        noSubscription: noSubscription
    };
};

export {
    memberStats
};
