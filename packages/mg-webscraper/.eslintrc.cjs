module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['ghost', '@typescript-eslint'],
    extends: [
        'plugin:ghost/node'
    ],
    rules: {
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}]
    },
    overrides: [
        {
            files: ['*.test.ts'],
            rules: {
                'no-undef': 'off'
            }
        },
        {
            files: ['*.d.ts'],
            rules: {
                '@typescript-eslint/no-unused-vars': 'off'
            }
        }
    ]
};
