const convertOptionsToSywac = (options = [], sywac) => {
    options.forEach((option) => {
        sywac.option(option);
    });
};

const convertOptionsToDefaults = (options = []) => {
    let defaults = {};

    options.forEach((option) => {
        let flags = option.flags.split(/[\s,]+/).map((item) => {
            return item.trim().replace(/^-+/, '');
        });

        flags.forEach((flag) => {
            defaults[flag] = option.defaultValue;
        });
    });

    return defaults;
};

export {
    convertOptionsToSywac,
    convertOptionsToDefaults
};
