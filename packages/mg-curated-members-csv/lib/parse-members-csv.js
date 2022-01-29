import MgFsUtils from '@tryghost/mg-fs-utils';

const parseMembersCSV = async (ctx) => {
    const {options} = ctx;

    // grab the main file "signups"
    let parsed = await MgFsUtils.csv.parse(options.pathToFile);

    return parsed;
};

export default parseMembersCSV;
