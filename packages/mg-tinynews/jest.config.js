// Extra assertions are from https://github.com/jest-community/jest-extended
export default async () => {
    return {
        verbose: true,
        watchman: false,
        setupFilesAfterEnv: ['jest-extended/all']
    };
};
