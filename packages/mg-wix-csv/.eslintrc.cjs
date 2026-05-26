module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['ghost'],
    extends: [
        'plugin:ghost/node'
    ],
    rules: {
        'no-unused-vars': 'off',
        'no-undef': 'off',
        'ghost/ghost-custom/no-native-errors': 'off',
        'ghost/ghost-custom/no-native-error': 'off',
        'ghost/ghost-custom/ghost-error-usage': 'off',
        'ghost/filenames/match-regex': 'off'
    }
};
