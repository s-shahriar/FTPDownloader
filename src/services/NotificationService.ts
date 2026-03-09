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
  private lastNotificationUpdate: number = 0;
  private notificationUpdateThrottle: number = 1500; // Update notification max once every 1.5 seconds

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

    // Show simple one-time notification
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⬇️ Download Started',
          body: filename,
          data: { type: 'download_started', downloadId },
          categoryIdentifier: 'downloads',
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to show start notification:', error);
    }
  }

  async updateDownloadProgress(
    downloadId: string,
    filename: string,
    progress: number,
    speed: number
  ): Promise<void> {
    // DO NOTHING - we don't show progress notifications anymore
    // Only show notifications for events: started, completed, failed, paused, resumed
    return;
  }

  async showDownloadCompleted(downloadId: string, filename: string): Promise<void> {
    if (!this.permissionGranted) return;

    // Show completion notification
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✓ Download Complete',
          body: filename,
          data: { type: 'download_completed', downloadId },
          categoryIdentifier: 'downloads',
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to show completion notification:', error);
    }
  }

  async showDownloadFailed(downloadId: string, filename: string, error: string): Promise<void> {
    if (!this.permissionGranted) return;

    // Show error notification
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✗ Download Failed',
          body: `${filename}: ${error}`,
          data: { type: 'download_failed', downloadId },
          categoryIdentifier: 'downloads',
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to show failure notification:', error);
    }
  }

  async showDownloadPaused(downloadId: string, filename: string): Promise<void> {
    if (!this.permissionGranted) return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏸️ Download Paused',
          body: filename,
          data: { type: 'download_paused', downloadId },
          categoryIdentifier: 'downloads',
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to show pause notification:', error);
    }
  }

  async showDownloadResumed(downloadId: string, filename: string): Promise<void> {
    if (!this.permissionGranted) return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '▶️ Download Resumed',
          body: filename,
          data: { type: 'download_resumed', downloadId },
          categoryIdentifier: 'downloads',
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to show resume notification:', error);
    }
  }

  async dismissNotification(downloadId: string): Promise<void> {
    // No longer needed - we don't have persistent notifications
    return;
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
   * Uses a single notification that updates in place (like Chrome's download manager)
   */
  private async updatePersistentNotification(): Promise<void> {
    if (!this.permissionGranted || Platform.OS === 'web') return;

    const activeCount = this.activeDownloads.size;

    // No active downloads - dismiss notification
    if (activeCount === 0) {
      if (this.persistentNotificationId) {
        try {
          await Notifications.dismissNotificationAsync(this.persistentNotificationId);
        } catch {}
        this.persistentNotificationId = null;
      }
      this.lastNotificationUpdate = 0; // Reset throttle
      return;
    }

    // CRITICAL: Throttle notification updates to prevent notification bombing
    // When multiple downloads are active, each can trigger updates at different times
    // This ensures we only update the notification once every 1.5 seconds max
    const now = Date.now();
    if (now - this.lastNotificationUpdate < this.notificationUpdateThrottle) {
      // Too soon - skip this update
      return;
    }
    this.lastNotificationUpdate = now;

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

      // On Android, using the same tag will update the existing notification in place
      const notificationContent: any = {
        title,
        body,
        data: {
          type: 'download_progress',
          count: activeCount,
        },
        categoryIdentifier: 'downloads',
        sticky: true,
        priority: Platform.OS === 'android' ? Notifications.AndroidNotificationPriority.LOW : undefined,
      };

      // Android-specific: Add tag and progress bar to update notification in place
      if (Platform.OS === 'android') {
        notificationContent.sound = null;
        notificationContent.vibrate = false;
        notificationContent.android = {
          channelId: 'downloads',
          tag: 'ftp_downloads', // CRITICAL: Same tag makes Android replace notification instead of creating new one
          priority: Notifications.AndroidNotificationPriority.LOW,
          progress: {
            max: 100,
            current: avgProgress,
            indeterminate: false,
          },
          ongoing: true, // Makes it non-dismissible while downloading
          autoCancel: false,
        };
      }

      // DO NOT dismiss old notification - Android will replace it automatically via tag
      // Dismissing causes multiple separate notifications (notification bombing!)

      // Create/update notification - Android replaces old one with same tag
      this.persistentNotificationId = await Notifications.scheduleNotificationAsync({
        content: notificationContent,
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
