import * as FileSystem from 'expo-file-system/legacy';
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';
import { showToast } from '../components/Toast';
import { notificationService } from './NotificationService';

const REPO = 's-shahriar/FTPDownloader';

// The releases atom feed, NOT api.github.com. The REST API allows only 60
// unauthenticated requests per hour per IP, and on a carrier-NAT connection
// that budget is spent by everyone sharing the address — so the update check
// got a 403 almost every time. github.com itself has no such limit.
const RELEASES_FEED = `https://github.com/${REPO}/releases.atom`;
const RELEASE_DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download`;
const CHECK_TIMEOUT_MS = 15000;

/** Undo one round of XML escaping. `&amp;` must come last or it double-decodes. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Release notes arrive as escaped HTML; the changelog dialog wants plain text. */
function htmlToPlainText(html: string): string {
  return decodeEntities(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|h[1-6]|li|ul|ol|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface UpdateInfo {
  available: boolean;
  version: string;
  url?: string;
  name?: string;
  changelog?: string;
}

export const updateService = {
  async checkForUpdate(): Promise<UpdateInfo> {
    // fetch has no timeout of its own; without this a stalled connection
    // leaves the Settings spinner going forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(RELEASES_FEED, {
        headers: { Accept: 'application/atom+xml' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`GitHub returned HTTP ${response.status}`);
      }

      const xml = await response.text();
      const entry = xml.split('<entry>')[1];
      if (!entry) {
        throw new Error('No releases published yet');
      }

      // The alternate link is .../releases/tag/<tag> — the tag is the only
      // field here that is guaranteed machine-readable.
      const tagMatch = entry.match(/href="[^"]*\/releases\/tag\/([^"]+)"/);
      if (!tagMatch) {
        throw new Error('Could not read the latest version');
      }

      const tag = decodeEntities(tagMatch[1]);
      const latestVersion = tag.replace(/^v/, '');
      const currentVersion =
        Constants.nativeAppVersion || Constants.expoConfig?.version || '1.0.0';

      const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);

      // The feed lists releases, not their assets. Asset names follow the
      // release convention in CLAUDE.md (FTP-Downloader-vX.Y.Z.apk), so the
      // download URL is derived from the tag. Keep the two in step.
      // `name` is also used as the on-disk filename by downloadAndInstall.
      const apkName = `FTP-Downloader-${tag}.apk`;

      return {
        available: this.compareVersions(latestVersion, currentVersion) > 0,
        version: latestVersion,
        url: `${RELEASE_DOWNLOAD_BASE}/${encodeURIComponent(tag)}/${encodeURIComponent(apkName)}`,
        name: apkName,
        changelog: contentMatch ? htmlToPlainText(contentMatch[1]) : undefined,
      };
    } catch (error: any) {
      console.error('Update check error:', error);
      if (error?.name === 'AbortError') {
        throw new Error('Update check timed out — check your connection');
      }
      throw new Error(error?.message || 'Could not check for updates');
    } finally {
      clearTimeout(timer);
    }
  },

  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  },

  async downloadAndInstall(update: UpdateInfo) {
    if (!update.url) throw new Error('Update URL not found');

    const updateId = 'app_update';
    const filename = update.name || `FTPDownloader-v${update.version}.apk`;
    const downloadUri = FileSystem.cacheDirectory + filename;

    try {
      // First clean up any old update files
      await this.cleanupDownloads();
      
      showToast('Downloading update artifact...');
      
      // Initialize the notification for update progress
      await notificationService.onDownloadStart(updateId, filename, 'Updates');

      const downloadResumable = FileSystem.createDownloadResumable(
        update.url,
        downloadUri,
        {},
        (progress) => {
          const totalBytes = progress.totalBytesExpectedToWrite;
          const downloadedBytes = progress.totalBytesWritten;
          const percentage = Math.round((downloadedBytes / totalBytes) * 100);
          
          notificationService.onDownloadProgress({
            id: updateId,
            filename,
            progress: percentage,
            downloadedBytes,
            totalBytes,
            speed: 0, // Not needed for simple update notification
            eta: 0,
            status: 'downloading'
          });
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result) {
        await notificationService.onDownloadFailed(updateId, filename, 'Download interrupted');
        return;
      }

      await notificationService.onDownloadComplete(updateId, filename);
      showToast('Installation starting...');

      if (Platform.OS === 'android') {
        if (NativeModules.UpdateModule) {
           await NativeModules.UpdateModule.installApk(result.uri);
        } else {
           if (await Sharing.isAvailableAsync()) {
             await Sharing.shareAsync(result.uri, {
                mimeType: 'application/vnd.android.package-archive',
             });
           }
        }
      }
    } catch (e: any) {
      console.error('Download update error:', e);
      await notificationService.onDownloadFailed(updateId, filename, e.message || 'Download failed');
      throw e;
    }
  },

  async cleanupDownloads() {
    try {
      const dir = FileSystem.cacheDirectory!;
      const files = await FileSystem.readDirectoryAsync(dir);
      for (const file of files) {
        if (file.endsWith('.apk')) {
          await FileSystem.deleteAsync(dir + file, { idempotent: true });
        }
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
  }
};
