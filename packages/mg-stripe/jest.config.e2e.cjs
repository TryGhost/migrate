/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    testEnvironment: 'node',
    preset: 'ts-jest',
    testTimeout: 60 * 1000,
    roots: [
        './build/test/e2e/'
    ]
};
