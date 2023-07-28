import fsUtils from '@tryghost/mg-fs-utils';

const parseCSV = fsUtils.csv.parseCSV;

export default async (ctx) => {
    const {options} = ctx;

    let parsed = await parseCSV(options.pathToFile);

    return parsed;
};
