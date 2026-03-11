const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Custom config plugin to add network security configuration
 * for allowing cleartext (HTTP) traffic on Android
 */
module.exports = function withNetworkSecurityConfig(config) {
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    // Add usesCleartextTraffic attribute
    mainApplication.$['android:usesCleartextTraffic'] = 'true';

    // Add network security config reference
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlFolder = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      if (!fs.existsSync(xmlFolder)) {
        fs.mkdirSync(xmlFolder, { recursive: true });
      }

      const xmlPath = path.join(xmlFolder, 'network_security_config.xml');
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>`;

      fs.writeFileSync(xmlPath, xmlContent);
      return config;
    },
  ]);
};
