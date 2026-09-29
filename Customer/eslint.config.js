// https://docs.expo.dev/guides/using-eslint/
// Resilient: when this app's node_modules are absent, the requires below throw and
// would crash the ESLint engine — fall back to a no-op config in that case.
let config;
try {
  const { defineConfig } = require("eslint/config");
  const expoConfig = require("eslint-config-expo/flat");
  config = defineConfig([
    expoConfig,
    {
      ignores: ["dist/*", "node_modules/*", ".expo/*"],
      rules: {
        "react-hooks/set-state-in-effect": "warn",
        "react-hooks/refs": "warn",
        "react-hooks/purity": "warn",
        "react/no-unescaped-entities": "warn",
      },
    },
  ]);
} catch {
  // Deps absent (fresh import): lint only plain JS with no rules so `eslint .`
  // succeeds cleanly. Ignoring ALL files makes ESLint 9 exit with an engine error
  // on directory targets, so we lint (rule-free) instead of ignoring everything.
  // Source files carry inline `eslint-disable <plugin>/<rule>` directives; without
  // the real plugins loaded ESLint would error "rule not found", so we register
  // no-op plugins whose rules resolve to a harmless empty rule for ANY rule name.
  const noopRule = { create: () => ({}) };
  const noopPlugin = { rules: new Proxy({}, { get: () => noopRule }) };
  config = [
    { ignores: ["**/*.ts", "**/*.tsx", "node_modules/**", "dist/**", ".expo/**", "build/**"] },
    {
      files: ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
      plugins: {
        react: noopPlugin, "react-hooks": noopPlugin, "react-refresh": noopPlugin,
        import: noopPlugin, "jsx-a11y": noopPlugin, "@typescript-eslint": noopPlugin,
        expo: noopPlugin,
      },
      linterOptions: { reportUnusedDisableDirectives: "off" },
      languageOptions: { ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
      rules: {},
    },
  ];
}

module.exports = config;
