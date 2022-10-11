// Extra assertions are from https://github.com/jest-community/jest-extended
module.exports = async () => {
    return {
        setupFilesAfterEnv: ['jest-extended/all']
    };
};
