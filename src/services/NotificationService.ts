import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications should be handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

interface DownloadInfo {
  id: string;
  filename: string;
  progress: number;
  speed: number;
  status: string;
}

class NotificationService {
  private static instance: NotificationService;
  private permissionGranted: boolean = false;
  private persistentNotificationId: string | null = null;
  private activeDownloads: Map<string, DownloadInfo> = new Map();

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async initialize(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      this.permissionGranted = finalStatus === 'granted';

      if (this.permissionGranted && Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('downloads', {
          name: 'Downloads',
          importance: Notifications.AndroidImportance.LOW, // Changed to LOW for non-intrusive
          vibrationPattern: [0],
          lightColor: '#3d7fff',
          sound: null,
          enableVibrate: false,
          showBadge: false,
        });
      }

      return this.permissionGranted;
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
      return false;
    }
  }

  async showDownloadStarted(downloadId: string, filename: string): Promise<void> {
    if (!this.permissionGranted) return;

    this.activeDownloads.set(downloadId, {
      id: downloadId,
      filename,
      progress: 0,
      speed: 0,
      status: 'downloading',
    });

    await this.updatePersistentNotification();
  }

  async updateDownloadProgress(
    downloadId: string,
    filename: string,
    progress: number,
    speed: number
  ): Promise<void> {
    if (!this.permissionGranted || Platform.OS === 'web') return;

    const info = this.activeDownloads.get(downloadId);
    if (info) {
      info.progress = progress;
      info.speed = speed;
      info.filename = filename;
      this.activeDownloads.set(downloadId, info);
    } else {
      this.activeDownloads.set(downloadId, {
        id: downloadId,
        filename,
        progress,
        speed,
        status: 'downloading',
      });
    }

    await this.updatePersistentNotification();
  }

  async showDownloadCompleted(downloadId: string, filename: string): Promise<void> {
    if (!this.permissionGranted) return;

    this.activeDownloads.delete(downloadId);

    // Show completion notification briefly
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✓ Download Complete',
          body: filename,
          data: { type: 'download_completed' },
          categoryIdentifier: 'downloads',
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to show completion notification:', error);
    }

    // Update or dismiss persistent notification
    await this.updatePersistentNotification();
  }

  async showDownloadFailed(downloadId: string, filename: string, error: string): Promise<void> {
    if (!this.permissionGranted) return;

    this.activeDownloads.delete(downloadId);

    // Show error notification
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✗ Download Failed',
          body: `${filename}: ${error}`,
          data: { type: 'download_failed' },
          categoryIdentifier: 'downloads',
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to show failure notification:', error);
    }

    await this.updatePersistentNotification();
  }

  async dismissNotification(downloadId: string): Promise<void> {
    this.activeDownloads.delete(downloadId);
    await this.updatePersistentNotification();
  }

  async dismissAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
      this.persistentNotificationId = null;
      this.activeDownloads.clear();
    } catch (error) {
      console.error('Failed to dismiss all notifications:', error);
    }
  }

  /**
   * Chrome-style persistent notification showing all active downloads
   */
  private async updatePersistentNotification(): Promise<void> {
    if (!this.permissionGranted || Platform.OS === 'web') return;

    const activeCount = this.activeDownloads.size;

    // Dismiss old persistent notification if exists
    if (this.persistentNotificationId) {
      try {
        await Notifications.dismissNotificationAsync(this.persistentNotificationId);
      } catch {}
      this.persistentNotificationId = null;
    }

    // No active downloads - don't show notification
    if (activeCount === 0) {
      return;
    }

    try {
      // Calculate aggregate stats
      let totalProgress = 0;
      let totalSpeed = 0;
      let firstFile = '';

      this.activeDownloads.forEach((info) => {
        totalProgress += info.progress;
        totalSpeed += info.speed;
        if (!firstFile) firstFile = info.filename;
      });

      const avgProgress = Math.round(totalProgress / activeCount);
      const speedStr = this.formatSpeed(totalSpeed);

      // Create notification body
      const title = activeCount === 1
        ? firstFile
        : `${activeCount} files downloading`;

      const body = `${avgProgress}%${speedStr ? ` • ${speedStr}` : ''}`;

      // Show persistent notification
      this.persistentNotificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { type: 'download_progress', count: activeCount },
          categoryIdentifier: 'downloads',
          sticky: true, // Make it persistent
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to update persistent notification:', error);
    }
  }

  private formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec <= 0) return '';
    if (bytesPerSec >= 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  }

  getPermissionStatus(): boolean {
    return this.permissionGranted;
  }
}

export const notificationService = NotificationService.getInstance();
