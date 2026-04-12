const defaultVersion = '2.0.0';

export default (version) => {
    return {
        meta: {
            exported_on: Date.now(),
            version: version || defaultVersion
        },
        data: {}
    };
};
