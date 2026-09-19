const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Keep the notifee notification icons through release resource shrinking.
 *
 * The icons are referenced only by name from JavaScript, so R8's resource shrinker
 * removes them. Android then rejects any notification that names a missing smallIcon
 * ("Invalid notification (no valid small icon)"), which aborted saving downloads.
 */
const KEEP = [
  'ic_check', 'ic_error', 'ic_download', 'ic_pause', 'ic_play', 'ic_cancel',
  'ic_clear', 'ic_refresh', 'ic_schedule', 'ic_open', 'notification_icon',
  'progress_gradient', 'progress_wavy',
].map(name => `@drawable/${name}`).join(',');

module.exports = function withKeepNotificationIcons(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const rawFolder = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/raw');
      if (!fs.existsSync(rawFolder)) {
        fs.mkdirSync(rawFolder, { recursive: true });
      }

      fs.writeFileSync(
        path.join(rawFolder, 'keep.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources xmlns:tools="http://schemas.android.com/tools"\n    tools:keep="${KEEP}" />\n`,
      );
      return config;
    },
  ]);
};
