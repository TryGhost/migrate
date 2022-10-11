import fsUtils from '@tryghost/mg-fs-utils';
const parseCSV = fsUtils.csv.parseCSV;

export default async (ctx) => {
    const {options} = ctx;

    // grab the main file "signups"
    let parsed = await parseCSV(options.pathToFile);

    return parsed;
};
