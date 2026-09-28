// Root ESLint config — delegates to the Customer Expo app config when its
// dependencies are installed. If Customer/node_modules is absent (fresh import),
// the Expo config's requires ("eslint/config", "eslint-config-expo/flat") cannot
// resolve and its TypeScript parser is unavailable; we then also ignore Customer/**
// so the linter engine runs cleanly instead of throwing engine/parsing errors.
// (web_panel / frontend keep their own configs, linted from their own directories.)
const IGNORES = ["**/node_modules/**", "web_panel/**", "frontend/**", "backend/**", ".emergent/**", "**/dist/**", "**/.expo/**", "Customer/scripts/**"];

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

module.exports = [
  { ignores: ok ? IGNORES : [...IGNORES, "Customer/**"] },
  ...scoped,
  ...(ok ? [{ files: ["Customer/**/*.{js,jsx,ts,tsx}"], rules: { "import/no-unresolved": "off" } }] : []),
];
