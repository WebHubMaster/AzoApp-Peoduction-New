const { withProjectBuildGradle } = require("@expo/config-plugins");

/**
 * Pin the Firebase Android BoM to 33.16.0 (firebase-messaging 24.1.x).
 *
 * WHY: RNFB v26 bundles Firebase BoM 34.x → firebase-messaging 25.x, which
 * DEPRECATED the legacy FirebaseMessaging.getToken() that BOTH
 * expo-notifications' getDevicePushTokenAsync AND RNFB messaging().getToken()
 * still call. On 25.x that path either throws "API disabled. Please use
 * register()" (FID enabled) or is rejected with HTTP 400 INVALID_ARGUMENT /
 * "FCM Registration failed!" (FID disabled) → the device never gets an FCM
 * token. firebase-messaging 24.x (BoM 33.16.0) has the classic, working
 * getToken() with none of that behaviour, so we force the whole BoM down.
 * A resolutionStrategy force on the BoM cascades its version constraints to
 * every com.google.firebase:* library, keeping them internally consistent.
 */
const MARKER = "AzoApp: pin Firebase BoM";
const BLOCK = `

// ${MARKER} 33.16.0 so firebase-messaging stays on 24.x (working getToken()).
allprojects {
  configurations.all {
    resolutionStrategy {
      force "com.google.firebase:firebase-bom:33.16.0"
      eachDependency { details ->
        if (details.requested.group == "com.google.firebase" && details.requested.name == "firebase-bom") {
          details.useVersion "33.16.0"
          details.because "AzoApp: keep firebase-messaging on 24.x for reliable FCM getToken()"
        }
      }
    }
  }
}
`;

module.exports = function withFirebaseBomPin(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += BLOCK;
    }
    return cfg;
  });
};
