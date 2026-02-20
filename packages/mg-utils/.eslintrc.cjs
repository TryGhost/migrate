module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.json'
    },
    plugins: ['ghost', '@typescript-eslint'],
    extends: [
        'plugin:ghost/ts'
    ]
};
