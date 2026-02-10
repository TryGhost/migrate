module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['ghost'],
    extends: [
        'plugin:ghost/ts'
    ],
    parserOptions: {
        project: './tsconfig.json'
    },
    rules: {
        'ghost/filenames/match-exported-class': 'off'
    }
};
