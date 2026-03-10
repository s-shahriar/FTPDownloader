import notifee, { AndroidStyle, AndroidImportance, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';

interface DownloadNotificationData {
  id: string;
  filename: string;
  progress: number;
  speed: number;
  eta: number;
  downloadedBytes: number;
  totalBytes: number;
  status: 'downloading' | 'queued' | 'paused' | 'completed' | 'failed';
  category?: string;
}

type DownloadStatus = 'downloading' | 'queued' | 'paused' | 'completed' | 'failed';

class NotificationService {
  private static instance: NotificationService;
  private permissionGranted: boolean = false;
  private foregroundServiceId: string | null = null;
  private activeDownloads: Map<string, DownloadNotificationData> = new Map();
  private notificationMap: Map<string, string> = new Map();
  private lastUpdateTime: Map<string, number> = new Map();
  private readonly UPDATE_THROTTLE_MS = 2000;

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
      // Request notification permissions
      const settings = await notifee.requestPermission();
      this.permissionGranted = settings.authorizationStatus >= 1; // 1 = AUTHORIZED

      if (this.permissionGranted && Platform.OS === 'android') {
        await this.createChannels();
      }

      return this.permissionGranted;
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
      return false;
    }
  }

  private async createChannels() {
    // Channel for individual download notifications
    await notifee.createChannel({
      id: 'downloads',
      name: 'Downloads',
      importance: AndroidImportance.DEFAULT,
      sound: undefined,
      vibration: false,
      lights: true,
      lightColor: '#3d7fff',
      badge: false,
    });

    // Channel for foreground service summary
    await notifee.createChannel({
      id: 'download_service',
      name: 'Download Service',
      importance: AndroidImportance.LOW,
      sound: undefined,
      vibration: false,
      lights: false,
      badge: false,
    });

    // Channel for completion/failure events
    await notifee.createChannel({
      id: 'download_events',
      name: 'Download Events',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
      badge: true,
    });
  }

  async onDownloadStart(id: string, filename: string, category?: string) {
    if (!this.permissionGranted) return;

    // Add to active downloads
    this.activeDownloads.set(id, {
      id,
      filename,
      progress: 0,
      speed: 0,
      eta: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      status: 'downloading',
      category,
    });

    // Show individual notification for this download
    await this.showDownloadNotification(this.activeDownloads.get(id)!);
  }

  async onDownloadProgress(data: DownloadNotificationData) {
    if (!this.permissionGranted) return;

    // Throttle updates
    const now = Date.now();
    const last = this.lastUpdateTime.get(data.id) || 0;
    if (now - last < this.UPDATE_THROTTLE_MS) {
      return;
    }
    this.lastUpdateTime.set(data.id, now);

    // Update state
    this.activeDownloads.set(data.id, data);

    // Update individual notification
    await this.showDownloadNotification(data);
  }

  async onDownloadComplete(id: string, filename: string) {
    if (!this.permissionGranted) return;

    // Show beautiful completion notification
    await notifee.displayNotification({
      title: '✓ Download Complete',
      body: filename,
      android: {
        channelId: 'download_events',
        importance: AndroidImportance.HIGH,
        smallIcon: 'ic_check',
        color: '#00c8a0', // Success
        sound: 'default',
        badge: true,
        pressAction: {
          id: 'open_downloads',
        },
        actions: [
          {
            title: 'Open',
            icon: 'ic_open',
            pressAction: { id: 'open_downloads' },
          },
        ],
      },
    });

    // Remove from active
    this.activeDownloads.delete(id);
    this.lastUpdateTime.delete(id);

    // Dismiss download notification immediately (completion notification replaces it)
    await this.dismissDownloadNotification(id);

    // If this was the foreground service, reassign to next download
    if (this.foregroundServiceId === `download_${id}`) {
      this.foregroundServiceId = null;

      // Make next download the foreground service
      const nextDownload = Array.from(this.activeDownloads.values())[0];
      if (nextDownload) {
        await this.showDownloadNotification(nextDownload);
      } else {
        await notifee.stopForegroundService();
      }
    }
  }

  async onDownloadFailed(id: string, filename: string, error: string) {
    if (!this.permissionGranted) return;

    // Show beautiful error notification
    await notifee.displayNotification({
      title: '✗ Download Failed',
      body: `${filename}\n${error}`,
      android: {
        channelId: 'download_events',
        importance: AndroidImportance.HIGH,
        smallIcon: 'ic_error',
        color: '#ff4d6a', // Error
        sound: 'default',
        actions: [
          {
            title: 'Retry',
            icon: 'ic_refresh',
            pressAction: { id: `retry_${id}` },
          },
          {
            title: 'Dismiss',
            icon: 'ic_clear',
            pressAction: { id: `clear_${id}` },
          },
        ],
      },
    });

    // Remove from active
    this.activeDownloads.delete(id);
    this.lastUpdateTime.delete(id);

    // Dismiss download notification
    await this.dismissDownloadNotification(id);

    // If this was the foreground service, reassign to next download
    if (this.foregroundServiceId === `download_${id}`) {
      this.foregroundServiceId = null;

      // Make next download the foreground service
      const nextDownload = Array.from(this.activeDownloads.values())[0];
      if (nextDownload) {
        await this.showDownloadNotification(nextDownload);
      } else {
        await notifee.stopForegroundService();
      }
    }
  }

  async onDownloadPaused(id: string, filename: string) {
    if (!this.permissionGranted) return;

    const data = this.activeDownloads.get(id);
    if (data) {
      data.status = 'paused';
      data.speed = 0;
      data.eta = 0;
      await this.showDownloadNotification(data);
    }
  }

  async onDownloadResumed(id: string, filename: string) {
    if (!this.permissionGranted) return;

    const data = this.activeDownloads.get(id);
    if (data) {
      data.status = 'downloading';
      await this.showDownloadNotification(data);
    }
  }

  private async startForegroundService() {
    const notificationId = 'download_foreground_service';

    await notifee.displayNotification({
      id: notificationId,
      title: 'Download Manager Active',
      body: 'Preparing downloads...',
      android: {
        channelId: 'download_service',
        asForegroundService: true,
        ongoing: true,
        autoCancel: false,
        color: '#3d7fff',
        colorized: true,
        smallIcon: 'ic_download',
        progress: {
          indeterminate: true,
        },
        pressAction: {
          id: 'open_downloads',
        },
      },
    });

    this.foregroundServiceId = notificationId;
  }

  private async updateSummaryNotification() {
    if (!this.foregroundServiceId || this.activeDownloads.size === 0) {
      return;
    }

    const downloads = Array.from(this.activeDownloads.values());

    // Calculate aggregate statistics
    const totalProgress = downloads.reduce((sum, d) => sum + d.progress, 0);
    const avgProgress = Math.round(totalProgress / downloads.length);
    const totalSpeed = downloads
      .filter((d) => d.status === 'downloading')
      .reduce((sum, d) => sum + d.speed, 0);

    // Count by status
    const downloadingCount = downloads.filter((d) => d.status === 'downloading').length;
    const queuedCount = downloads.filter((d) => d.status === 'queued').length;
    const pausedCount = downloads.filter((d) => d.status === 'paused').length;

    // Create title - show count if multiple downloads
    const title = downloads.length === 1
      ? 'Downloading file'
      : `Downloading ${downloads.length} files`;

    // Create body - compact summary
    const bodyParts = [];
    if (downloadingCount > 0) bodyParts.push(`${downloadingCount} active`);
    if (pausedCount > 0) bodyParts.push(`${pausedCount} paused`);
    if (queuedCount > 0) bodyParts.push(`${queuedCount} queued`);
    if (totalSpeed > 0) bodyParts.push(this.formatSpeed(totalSpeed));

    const body = bodyParts.length > 0 ? bodyParts.join(' • ') : 'Processing...';

    // Create expanded text with better formatting
    const expandedLines = downloads
      .map((d, index) => {
        // Status indicator
        const statusEmoji = d.status === 'downloading' ? '⬇' : d.status === 'paused' ? '⏸' : '⏳';

        // Progress and speed info
        const progressInfo = d.status === 'downloading'
          ? `${d.progress}% • ${this.formatSpeed(d.speed)}${d.eta > 0 ? ' • ' + this.formatTime(d.eta) : ''}`
          : `${d.progress}% • ${this.formatBytes(d.downloadedBytes)} / ${this.formatBytes(d.totalBytes)}`;

        // Filename (truncate if too long)
        const filename = d.filename.length > 50 ? d.filename.substring(0, 47) + '...' : d.filename;

        // Format: [Emoji] Filename
        //         Progress info
        return `${statusEmoji} ${filename}\n   ${progressInfo}${index < downloads.length - 1 ? '\n' : ''}`;
      })
      .join('\n');

    await notifee.displayNotification({
      id: this.foregroundServiceId,
      title,
      body,
      android: {
        channelId: 'download_service',
        asForegroundService: true,
        ongoing: true,
        autoCancel: false,
        onlyAlertOnce: true,
        // Use default color for dark/light mode compatibility (no hardcoded colors)
        smallIcon: 'ic_download',
        progress: {
          max: 100,
          current: avgProgress,
          indeterminate: false,
        },
        style: {
          type: AndroidStyle.BIGTEXT,
          text: expandedLines,
        },
        actions: downloadingCount > 0 ? [
          {
            title: 'Pause All',
            icon: 'ic_pause',
            pressAction: { id: 'pause_all' },
          },
          {
            title: 'Open',
            icon: 'ic_open',
            pressAction: { id: 'open_downloads' },
          },
        ] : [
          {
            title: 'Resume All',
            icon: 'ic_play',
            pressAction: { id: 'resume_all' },
          },
          {
            title: 'Open',
            icon: 'ic_open',
            pressAction: { id: 'open_downloads' },
          },
        ],
        pressAction: {
          id: 'open_downloads',
        },
      },
    });
  }

  private async showDownloadNotification(data: DownloadNotificationData) {
    const notificationId = `download_${data.id}`;

    // Beautiful title with category emoji
    const categoryEmoji = this.getCategoryEmoji(data.category);
    const title = `${categoryEmoji} ${data.filename}`;

    // Elegant subtitle - progress and speed on one line
    const progressText = `${data.progress}%`;
    const speedText = data.speed > 0 ? this.formatSpeed(data.speed) : '';
    const etaText = data.eta > 0 ? this.formatTime(data.eta) + ' left' : '';

    const subtitle = data.status === 'downloading'
      ? [speedText, etaText].filter(Boolean).join(' • ')
      : `${this.formatBytes(data.downloadedBytes)} / ${this.formatBytes(data.totalBytes)}`;

    // Clean expanded view with detailed breakdown
    const expandedParts = [];
    if (data.status === 'downloading') {
      expandedParts.push(`📊 Progress: ${data.progress}%`);
      expandedParts.push(`⚡ Speed: ${this.formatSpeed(data.speed)}`);
      if (data.eta > 0) expandedParts.push(`⏱ Time left: ${this.formatTime(data.eta)}`);
      expandedParts.push(`📦 ${this.formatBytes(data.downloadedBytes)} / ${this.formatBytes(data.totalBytes)}`);
    } else {
      expandedParts.push(`Downloaded: ${this.formatBytes(data.downloadedBytes)} / ${this.formatBytes(data.totalBytes)}`);
      expandedParts.push(`Status: ${data.status.charAt(0).toUpperCase() + data.status.slice(1)}`);
    }
    const expandedText = expandedParts.join('\n');

    // Determine actions based on status
    const actions = this.getActionsForStatus(data.status, data.id);

    // Check if this should be foreground service (first active download)
    const isFirstDownload = Array.from(this.activeDownloads.values())[0]?.id === data.id;
    const isForegroundService = isFirstDownload && (data.status === 'downloading' || data.status === 'paused');

    await notifee.displayNotification({
      id: notificationId,
      title,
      body: subtitle,
      android: {
        channelId: 'downloads',
        importance: AndroidImportance.DEFAULT,
        asForegroundService: isForegroundService,
        autoCancel: false,
        ongoing: data.status === 'downloading',
        onlyAlertOnce: true,
        smallIcon: this.getStatusIcon(data.status),
        // Subtle color accent - only for active downloads
        color: data.status === 'downloading' ? '#3d7fff' : undefined,
        progress:
          data.status === 'downloading' || data.status === 'paused'
            ? {
                max: 100,
                current: data.progress,
                indeterminate: false,
              }
            : undefined,
        style: {
          type: AndroidStyle.BIGTEXT,
          text: expandedText,
        },
        actions,
        pressAction: {
          id: 'open_downloads',
        },
      },
      data: {
        downloadId: data.id,
        type: 'download_progress',
      },
    });

    this.notificationMap.set(data.id, notificationId);

    // Track foreground service
    if (isForegroundService) {
      this.foregroundServiceId = notificationId;
    }
  }

  async dismissDownloadNotification(id: string) {
    const notificationId = this.notificationMap.get(id);
    if (notificationId) {
      await notifee.cancelNotification(notificationId);
      this.notificationMap.delete(id);
    }
  }

  async dismissAllNotifications() {
    try {
      await notifee.cancelAllNotifications();
      this.activeDownloads.clear();
      this.notificationMap.clear();
      this.lastUpdateTime.clear();
      this.foregroundServiceId = null;
    } catch (error) {
      console.error('Failed to dismiss all notifications:', error);
    }
  }

  private getCategoryEmoji(category?: string): string {
    if (!category) return '📥';

    // Match category to emoji
    if (category.toLowerCase().includes('movie')) return '🎬';
    if (category.toLowerCase().includes('series') || category.toLowerCase().includes('tv')) return '📺';
    if (category.toLowerCase().includes('anime') || category.toLowerCase().includes('cartoon')) return '🎨';
    if (category.toLowerCase().includes('music') || category.toLowerCase().includes('audio')) return '🎵';
    if (category.toLowerCase().includes('book')) return '📚';
    if (category.toLowerCase().includes('game')) return '🎮';

    return '📥'; // Default download icon
  }

  private getStatusColor(status: DownloadStatus): string {
    switch (status) {
      case 'downloading':
        return '#3d7fff'; // Primary
      case 'paused':
        return '#e8a020'; // Warning
      case 'completed':
        return '#00c8a0'; // Success
      case 'failed':
        return '#ff4d6a'; // Error
      case 'queued':
        return '#6b7394'; // Secondary
      default:
        return '#1a1a2e'; // Text
    }
  }

  private getStatusIcon(status: DownloadStatus): string {
    switch (status) {
      case 'downloading':
        return 'ic_download';
      case 'paused':
        return 'ic_pause';
      case 'completed':
        return 'ic_check';
      case 'failed':
        return 'ic_error';
      case 'queued':
        return 'ic_schedule';
      default:
        return 'ic_download';
    }
  }

  private getActionsForStatus(status: DownloadStatus, downloadId: string) {
    switch (status) {
      case 'downloading':
        return [
          {
            title: 'Pause',
            icon: 'ic_pause',
            pressAction: {
              id: `pause_${downloadId}`,
            },
          },
          {
            title: 'Cancel',
            icon: 'ic_cancel',
            pressAction: {
              id: `cancel_${downloadId}`,
            },
          },
        ];

      case 'paused':
        return [
          {
            title: 'Resume',
            icon: 'ic_play',
            pressAction: {
              id: `resume_${downloadId}`,
            },
          },
          {
            title: 'Cancel',
            icon: 'ic_cancel',
            pressAction: {
              id: `cancel_${downloadId}`,
            },
          },
        ];

      case 'queued':
        return [
          {
            title: 'Cancel',
            icon: 'ic_cancel',
            pressAction: {
              id: `cancel_${downloadId}`,
            },
          },
        ];

      case 'failed':
        return [
          {
            title: 'Retry',
            icon: 'ic_refresh',
            pressAction: {
              id: `retry_${downloadId}`,
            },
          },
          {
            title: 'Clear',
            icon: 'ic_clear',
            pressAction: {
              id: `clear_${downloadId}`,
            },
          },
        ];

      case 'completed':
        return [
          {
            title: 'Clear',
            icon: 'ic_clear',
            pressAction: {
              id: `clear_${downloadId}`,
            },
          },
        ];

      default:
        return [];
    }
  }

  private formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec <= 0) return '';
    if (bytesPerSec >= 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  }

  private formatTime(seconds: number): string {
    if (seconds <= 0 || !isFinite(seconds)) return '';
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    if (seconds < 3600) {
      const m = Math.floor(seconds / 60);
      const s = Math.ceil(seconds % 60);
      return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.ceil((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  getPermissionStatus(): boolean {
    return this.permissionGranted;
  }
}

export const notificationService = NotificationService.getInstance();
