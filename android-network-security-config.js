const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Custom config plugin to add network security configuration
 * for allowing cleartext (HTTP) traffic on Android
 */
module.exports = function withNetworkSecurityConfig(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    // Add usesCleartextTraffic attribute
    mainApplication.$['android:usesCleartextTraffic'] = 'true';

    // Add network security config reference
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    return config;
  });
};
