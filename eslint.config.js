import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.browser,
        },
    },
    {
        files: ['sw.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.serviceworker,
        },
    },
    {
        files: ['tests/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.node,
        },
    },
    {
        ignores: ['node_modules/'],
    },
];
