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
        // اختبارات الـ DOM تركّب jsdom على globalThis، فتصبح globals المتصفح متاحة فيها.
        files: ['tests/ui.test.js'],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
    },
    {
        ignores: ['node_modules/'],
    },
];
