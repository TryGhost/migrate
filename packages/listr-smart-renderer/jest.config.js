// Extra assertions are from https://github.com/jest-community/jest-extended
export default async () => {
    return {
        setupFilesAfterEnv: ['jest-extended/all'],
        moduleNameMapper: {
            '#ansi-styles': '<rootDir>/node_modules/chalk/source/vendor/ansi-styles/index.js',
            '#supports-color': '<rootDir>/node_modules/chalk/source/vendor/supports-color/index.js'
        }
    };
};
