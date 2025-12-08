const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');
const path = require('node:path');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

module.exports = [
  ...compat.config({
    extends: ['./.eslintrc.cjs'],
  }),
  {
    ignores: ['node_modules', 'dist', 'coverage', '*.js'],
  },
];
