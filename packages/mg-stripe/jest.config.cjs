/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    testEnvironment: 'node',
    transform: {},
    testTimeout: 60 * 1000,
    roots: [
        './build/test/'
    ]
};
