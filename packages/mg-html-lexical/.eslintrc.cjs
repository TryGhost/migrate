module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['ghost'],
    extends: [
        'plugin:ghost/node'
    ],
    rules: {
        'no-unused-vars': 'off', // doesn't work with typescript
        'no-undef': 'off', // doesn't work with typescript
        'ghost/ghost-custom/no-native-errors': 'off',
        'ghost/ghost-custom/no-native-error': 'off',
        'ghost/ghost-custom/ghost-error-usage': 'off'
    }
};
