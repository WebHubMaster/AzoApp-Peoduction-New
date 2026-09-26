// Root ESLint config — delegates to the Customer Expo app config (web_panel / frontend keep their own configs).
const customer = require("./Customer/eslint.config.js");

const scoped = customer.map((c) => {
  if (c.ignores && Object.keys(c).length === 1) return { ignores: c.ignores.map((g) => `Customer/${g}`) };
  return { ...c, files: (c.files || ["**/*.{js,jsx,ts,tsx}"]).map((f) => `Customer/${f.replace(/^\.\//, "")}`) };
});

module.exports = [
  { ignores: ["**/node_modules/**", "web_panel/**", "frontend/**", "backend/**", ".emergent/**", "**/dist/**", "**/.expo/**", "Customer/scripts/**"] },
  ...scoped,
  { files: ["Customer/**/*.{js,jsx,ts,tsx}"], rules: { "import/no-unresolved": "off" } },
];
