const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const prettierPlugin = require("eslint-plugin-prettier");

/**
 * In the new flat config, we export an array of config objects.
 * Here we use just one, named "my-config".
 */
module.exports = [
  {
    name: "my-config",
    files: ["**/*.ts", "**/*.js"],
    ignores: ["lib/**/*", "eslint.config.js"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "tsconfig.json",
        sourceType: "module",
      },
    },
    linterOptions: {
      noInlineConfig: false,
      reportUnusedDisableDirectives: "warn",
      reportUnusedInlineConfigs: "off",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-param-reassign": "warn",
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "block-like", next: "*" },
        { blankLine: "always", prev: "*", next: "block-like" },
      ],
    },
  },
];