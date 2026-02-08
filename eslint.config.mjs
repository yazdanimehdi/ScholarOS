import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  // Global ignores
  { ignores: ['dist/', 'node_modules/', '.astro/', 'src/content/', 'src/data/'] },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended (non-type-checked -- astro check handles types)
  ...tseslint.configs.recommended,

  // Astro recommended
  ...astro.configs.recommended,

  // Vue recommended (flat config)
  ...vue.configs['flat/recommended'],

  // Vue files: use @typescript-eslint/parser for <script lang="ts"> blocks
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // Global settings and rule overrides
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-assignment': 'warn',
      'vue/multi-word-component-names': 'off',
      // Disable Vue formatting rules -- Prettier handles formatting
      'vue/max-attributes-per-line': 'off',
      'vue/html-self-closing': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-indent': 'off',
    },
  },

  // Astro files: add Astro global types + disable rules that conflict with is:inline scripts
  {
    files: ['**/*.astro'],
    languageOptions: {
      globals: {
        ImageMetadata: 'readonly',
      },
    },
    rules: {
      'prefer-rest-params': 'off',
    },
  },

  // Allow console in scripts/
  {
    files: ['scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },

  // Cloudflare Worker (JS)
  {
    files: ['cloudflare-auth/**'],
    rules: {
      'no-console': 'off',
    },
  },
];
