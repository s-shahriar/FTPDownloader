import * as FileSystem from 'expo-file-system/legacy';
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';
import { showToast } from '../components/Toast';
import { notificationService } from './NotificationService';

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
