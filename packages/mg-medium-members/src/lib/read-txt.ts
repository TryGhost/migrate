import {existsSync} from 'node:fs';
import errors from '@tryghost/errors';
import {readFile} from 'node:fs/promises';

/**
 * Get basic stats on a Medium members txt file
 * @param {object} data
 * @param {string} data.txtpath path to txt file
 * @returns {object}
 */
const memberStats = async ({txtPath}: {txtPath: string}) => {
    if (typeof txtPath !== 'string') {
        throw new errors.BadRequestError({message: 'No file path provided'});
    } else if (!existsSync(txtPath)) {
        throw new errors.BadRequestError({message: 'File not found'});
    }

    const txtData = await readFile(txtPath, 'utf8');
    const emailList = txtData.split('\n').filter(el => el !== '');

    return {
        allMembers: emailList.length
    };
};

export {
    memberStats
};
