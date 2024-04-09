/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    testEnvironment: 'node',
    preset: 'ts-jest',
    testTimeout: 60 * 1000,
    roots: [
        './src/test/e2e/'
    ],
    transform: {
        '\\.[jt]s?$': [
            'ts-jest',
            {
                useESM: true
            }
        ]
    },
    moduleNameMapper: {
        '(.+)\\.js': '$1'
    },
    extensionsToTreatAsEsm: [
        '.ts'
    ]
};
