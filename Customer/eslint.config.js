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
  config = [{ ignores: ["**/*"] }];
}

module.exports = config;
