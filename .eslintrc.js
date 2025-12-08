/**
 * ESLint Configuration for MYM Chat Live Extension
 * Enforces code quality and consistency across the codebase
 */

module.exports = {
  env: {
    browser: true,
    es2021: true,
    webextensions: true,
  },
  extends: "eslint:recommended",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "script",
  },
  globals: {
    chrome: "readonly",
    browser: "readonly",
    APP_CONFIG: "readonly",
    debugLog: "readonly",
    globalThis: "readonly",
  },
  rules: {
    // Code Quality
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-console": ["warn", { allow: ["error", "warn", "info"] }],
    "prefer-const": "error",
    "no-var": "error",
    "no-debugger": "warn",

    // Best Practices
    "eqeqeq": ["error", "always"],
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-alert": "warn",
    "no-return-await": "error",

    // ES6+
    "arrow-spacing": "error",
    "no-duplicate-imports": "error",
    "prefer-arrow-callback": "warn",
    "prefer-template": "warn",

    // Formatting (handled by Prettier, but basic rules)
    "indent": ["error", 2, { SwitchCase: 1 }],
    "quotes": ["error", "double", { avoidEscape: true }],
    "semi": ["error", "always"],
    "comma-dangle": ["error", "always-multiline"],

    // Comments
    "spaced-comment": ["error", "always", { exceptions: ["-", "+", "="] }],
    "no-warning-comments": ["warn", { terms: ["TODO", "FIXME", "HACK"], location: "start" }],
  },
  overrides: [
    {
      files: ["tests/**/*.js"],
      env: {
        jest: true,
      },
      rules: {
        "no-console": "off",
      },
    },
    {
      files: ["minify.js", "build-*.js"],
      rules: {
        "no-console": "off",
      },
    },
  ],
};
