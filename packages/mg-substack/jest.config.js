// Extra assertions are from https://github.com/jest-community/jest-extended
export default async () => {
    return {
        setupFilesAfterEnv: ['jest-extended/all']
    };
};
