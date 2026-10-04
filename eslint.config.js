// Root ESLint config — delegates to the Customer Expo app config when its
// dependencies are installed. If Customer/node_modules is absent (fresh import),
// the Expo config's requires ("eslint/config", "eslint-config-expo/flat") cannot
// resolve and its TypeScript parser is unavailable; we then also ignore Customer/**
// so the linter engine runs cleanly instead of throwing engine/parsing errors.
// (web_panel / frontend keep their own configs, linted from their own directories.)
const IGNORES = ["**/node_modules/**", "web_panel/**", "backend/**", ".emergent/**", "**/dist/**", "**/.expo/**", "Customer/scripts/**"];

let scoped = [];
let ok = false;
try {
  const customer = require("./Customer/eslint.config.js");
  scoped = customer.map((c) => {
    if (c.ignores && Object.keys(c).length === 1) return { ignores: c.ignores.map((g) => `Customer/${g}`) };
    return { ...c, files: (c.files || ["**/*.{js,jsx,ts,tsx}"]).map((f) => `Customer/${f.replace(/^\.\//, "")}`) };
  });
  ok = true;
} catch {
  // Customer app deps not installed — skip Customer linting rather than crash/parse-error.
  scoped = [];
}

// Rule-free parse-only pass for app folders whose own config can't load from the
// repo root (frontend lints with its own config; Customer when its deps are absent).
// Uses frontend's TS parser so directory targets never hit "all files ignored".
let tsParser = null;
try { tsParser = require(require.resolve("@typescript-eslint/parser", { paths: [`${__dirname}/frontend`] })); } catch { /* parser unavailable */ }
const noopRule = { create: () => ({}) };
const noopPlugin = { rules: new Proxy({}, { get: () => noopRule }) };
const parseOnlyDirs = ["frontend"];
const parseOnly = tsParser ? [{
  files: parseOnlyDirs.map((d) => `${d}/**/*.{js,jsx,ts,tsx}`),
  ignores: ["**/node_modules/**", "**/dist/**", "**/.expo/**", "**/web-build/**"],
  plugins: {
    react: noopPlugin, "react-hooks": noopPlugin, "react-native": noopPlugin, import: noopPlugin,
    "jsx-a11y": noopPlugin, "@typescript-eslint": noopPlugin, expo: noopPlugin,
  },
  linterOptions: { reportUnusedDisableDirectives: "off" },
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
  rules: {},
}] : [];

module.exports = [
  { ignores: tsParser ? IGNORES : [...IGNORES, "frontend/**", ...(ok ? [] : ["Customer/**"])] },
  ...parseOnly,
  ...scoped,
  ...(ok ? [{ files: ["Customer/**/*.{js,jsx,ts,tsx}"], rules: { "import/no-unresolved": "off" } }] : []),
];
