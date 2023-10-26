import {process} from './process.js';

const memberStats = async ({csvPath, zipPath, includeUnsubscribed = false}: {csvPath?: string | string[], zipPath?: string, includeUnsubscribed?: boolean}) => {
    let allMembers: number = 0;

    if (csvPath) {
        let csvStats = await process({pathToCsv: csvPath, includeUnsubscribed});
        allMembers = csvStats.length;
    } else if (zipPath) {
        let zipStats = await process({pathToZip: zipPath, includeUnsubscribed});
        allMembers = zipStats.length;
    }

    return {
        allMembers: allMembers
    };
};

export {
    memberStats
};
