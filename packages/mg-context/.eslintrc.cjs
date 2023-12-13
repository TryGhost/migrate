module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['ghost'],
    extends: [
        'plugin:ghost/node'
    ],
    overrides: [
        {
            files: ['*.test.ts'],
            rules: {
                'no-undef': 'off'
            }
        }
    ]
};
