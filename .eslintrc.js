module.exports = {
  env: {
    browser: true,
    es2021: true,
    webextensions: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  globals: {
    chrome: 'readonly',
    $: 'readonly'
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'prefer-const': 'error',
    'no-var': 'error',
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { allowTemplateLiterals: true }],
    'indent': ['error', 2],
    'no-trailing-spaces': 'error',
    'no-multiple-empty-lines': ['error', { max: 2 }],
    'eol-last': 'error'
  }
};
