const nodeGlobals = {
  AbortController: "readonly",
  Array: "readonly",
  BigInt: "readonly",
  Boolean: "readonly",
  Buffer: "readonly",
  clearInterval: "readonly",
  __dirname: "readonly",
  Date: "readonly",
  console: "readonly",
  Error: "readonly",
  fetch: "readonly",
  JSON: "readonly",
  Map: "readonly",
  Math: "readonly",
  module: "readonly",
  Number: "readonly",
  Object: "readonly",
  Promise: "readonly",
  process: "readonly",
  RegExp: "readonly",
  require: "readonly",
  Set: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  String: "readonly",
  URL: "readonly"
};

const browserGlobals = {
  AbortController: "readonly",
  Array: "readonly",
  BigInt: "readonly",
  Boolean: "readonly",
  Date: "readonly",
  document: "readonly",
  Error: "readonly",
  fetch: "readonly",
  File: "readonly",
  Intl: "readonly",
  JSON: "readonly",
  Map: "readonly",
  Math: "readonly",
  navigator: "readonly",
  Number: "readonly",
  Object: "readonly",
  performance: "readonly",
  Promise: "readonly",
  RegExp: "readonly",
  Set: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  snarkjs: "readonly",
  String: "readonly"
};

const sourceFiles = [
  "api/**/*.js",
  "bench/**/*.js",
  "issuer/**/*.js",
  "lib/**/*.js",
  "scripts/**/*.js",
  "server/**/*.js",
  "tests/**/*.js"
];

const sourceRules = {
  "array-callback-return": "error",
  curly: ["error", "all"],
  eqeqeq: ["error", "always"],
  "no-async-promise-executor": "error",
  "no-constant-binary-expression": "error",
  "no-debugger": "error",
  "no-duplicate-imports": "error",
  "no-eval": "error",
  "no-func-assign": "error",
  "no-implied-eval": "error",
  "no-undef": "error",
  "no-new-wrappers": "error",
  "no-promise-executor-return": "error",
  "no-sparse-arrays": "error",
  "no-throw-literal": "error",
  "no-unmodified-loop-condition": "error",
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
  "no-var": "error",
  "object-shorthand": ["error", "always"],
  "prefer-const": "error",
  "prefer-promise-reject-errors": "error",
  "prefer-template": "error",
  "no-trailing-spaces": "error",
  "eol-last": ["error", "always"],
  quotes: ["error", "double", { avoidEscape: true }],
  semi: ["error", "always"]
};

module.exports = [
  {
    ignores: [
      "app/vendor/**",
      "app/artifacts/**",
      "circuits/build/**",
      "node_modules/**",
      "bench/export/**",
      "bench/results/**"
    ]
  },
  {
    files: sourceFiles,
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs", globals: nodeGlobals },
    rules: sourceRules
  },
  {
    files: ["app/app.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "script", globals: browserGlobals },
    rules: sourceRules
  },
  {
    files: ["eslint.config.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs", globals: nodeGlobals },
    rules: sourceRules
  }
];
