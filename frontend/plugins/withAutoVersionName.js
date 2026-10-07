/* eslint-disable */
/**
 * Auto version name per build. EAS (appVersionSource "remote" + autoIncrement) bumps
 * android.versionCode on every build; this appends a Gradle line that derives the
 * user-visible versionName from it: "<major>.<minor>.<versionCode>" (base from app.json
 * "version"). Runs after EAS writes versionCode, so every new build gets a new version.
 */
const { withAppBuildGradle } = require("expo/config-plugins");

const TAG = "// @azo-auto-version-name";

module.exports = function withAutoVersionName(config) {
  const [major = "1", minor = "0"] = String(config.version || "1.0.0").split(".");
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    src = src.split("\n").filter((l) => !l.includes(TAG)).join("\n");
    src += `\nandroid.defaultConfig.versionName = "${major}.${minor}." + android.defaultConfig.versionCode ${TAG}\n`;
    cfg.modResults.contents = src;
    return cfg;
  });
};
