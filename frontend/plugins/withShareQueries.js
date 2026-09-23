/* eslint-disable */
/**
 * Expo config plugin — Android package-visibility <queries> so the app can
 * (Android 11+ / targetSdk 30+):
 *   • launch WhatsApp directly (share the invoice PDF into its contact chooser)
 *   • resolve SEND / VIEW intents for application/pdf (share sheet + open PDF)
 * Without these, IntentLauncher can't see WhatsApp and the direct share silently
 * falls back to the generic sheet.
 */
const { withAndroidManifest } = require("expo/config-plugins");

const PACKAGES = ["com.whatsapp", "com.whatsapp.w4b"];

module.exports = function withShareQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries || [{}];
    const q = manifest.queries[0];

    // Visible packages (WhatsApp + WhatsApp Business).
    q.package = q.package || [];
    for (const name of PACKAGES) {
      if (!q.package.some((p) => p.$ && p.$["android:name"] === name)) {
        q.package.push({ $: { "android:name": name } });
      }
    }

    // Intent visibility for sending / viewing PDFs.
    q.intent = q.intent || [];
    const hasIntent = (action, mime) =>
      q.intent.some((i) =>
        (i.action || []).some((a) => a.$ && a.$["android:name"] === action) &&
        (i.data || []).some((d) => d.$ && d.$["android:mimeType"] === mime));
    const addIntent = (action, mime) => {
      if (hasIntent(action, mime)) return;
      q.intent.push({
        action: [{ $: { "android:name": action } }],
        data: [{ $: { "android:mimeType": mime } }],
      });
    };
    addIntent("android.intent.action.SEND", "application/pdf");
    addIntent("android.intent.action.VIEW", "application/pdf");

    return cfg;
  });
};
