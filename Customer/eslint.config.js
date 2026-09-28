// https://docs.expo.dev/guides/using-eslint/
// Resilient: when this app's node_modules are absent, the requires below throw and
// would crash the ESLint engine — fall back to a no-op config in that case.
let defineConfig, expoConfig;
try {
  ({ defineConfig } = require("eslint/config"));
  expoConfig = require("eslint-config-expo/flat");
} catch {
  module.exports = [{ ignores: ["**/*"] }];
  return;
}

module.exports = defineConfig([
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
