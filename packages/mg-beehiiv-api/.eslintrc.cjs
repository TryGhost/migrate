module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['ghost'],
    extends: [
        'plugin:ghost/node'
    ],
    rules: {
        'no-unused-vars': 'off', // doesn't work with typescript
        'no-undef': 'off', // doesn't work with typescript
        'ghost/filenames/match-regex': 'off'
    }
};
