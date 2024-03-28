/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    testEnvironment: 'node',
    preset: 'ts-jest',
    testTimeout: 10 * 1000,
    roots: [
        './src/test/unit/'
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
