import * as FileSystem from 'expo-file-system/legacy';
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';
import { showToast } from '../components/Toast';

const GITHUB_API = 'https://api.github.com/repos/s-shahriar/FTPDownloader/releases/latest';

export interface UpdateInfo {
  available: boolean;
  version: string;
  url?: string;
  name?: string;
  changelog?: string;
}

export const updateService = {
  async checkForUpdate(): Promise<UpdateInfo> {
    try {
      const response = await fetch(GITHUB_API, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error('Could not check for updates');
      }

      const data = await response.json();
      const latestVersion = data.tag_name.replace(/^v/, '');
      const currentVersion = Constants.nativeAppVersion || Constants.expoConfig?.version || '1.0.0';

      const isAvailable = this.compareVersions(latestVersion, currentVersion) > 0;

      // Find APK asset
      const apkAsset = data.assets.find((a: any) => a.name.endsWith('.apk'));

      return {
        available: isAvailable,
        version: latestVersion,
        url: apkAsset?.browser_download_url,
        name: apkAsset?.name,
        changelog: data.body,
      };
    } catch (error) {
      console.error('Update check error:', error);
      throw error;
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

    const filename = update.name || `FTPDownloader-v${update.version}.apk`;
    const downloadUri = FileSystem.cacheDirectory + filename;

    try {
      showToast('Downloading update...');
      const downloadResumable = FileSystem.createDownloadResumable(
        update.url,
        downloadUri
      );

      const result = await downloadResumable.downloadAsync();
      if (!result) return;

      showToast('Installation starting...');

      if (Platform.OS === 'android') {
        if (NativeModules.UpdateModule) {
           await NativeModules.UpdateModule.installApk(result.uri);
        } else {
           // Fallback to sharing if native module not ready
           if (await Sharing.isAvailableAsync()) {
             await Sharing.shareAsync(result.uri, {
                mimeType: 'application/vnd.android.package-archive',
             });
           }
        }
      }

      // Deletion strategy: Since the app restarts after update, 
      // it's best to trigger cleanup on next app start or after installation starts.
      // But we can try to schedule deletion if the installer allows.
    } catch (e) {
      console.error('Download update error:', e);
      throw e;
    }
  },

  async cleanupDownloads() {
    try {
      const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory!);
      for (const file of files) {
        if (file.endsWith('.apk')) {
          await FileSystem.deleteAsync(FileSystem.cacheDirectory + file, { idempotent: true });
        }
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
  }
};
