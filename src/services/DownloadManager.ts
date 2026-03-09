import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { DOWNLOAD_STATUS, DOWNLOAD_CONFIG, STORAGE_KEYS } from '../constants';
import { DownloadItem, DownloadProgress } from '../types';

// ── Speed Tracker ──────────────────────────────────────────
// Rolling-window speed calculator per download
interface SpeedSample {
  timestamp: number;
  bytes: number;
}

class SpeedTracker {
  private samples: SpeedSample[] = [];
  private windowMs: number;

  constructor(windowMs: number = DOWNLOAD_CONFIG.SPEED_SAMPLE_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  addSample(bytes: number): void {
    const now = Date.now();
    this.samples.push({ timestamp: now, bytes });
    // Prune samples outside the window
    const cutoff = now - this.windowMs;
    this.samples = this.samples.filter(s => s.timestamp >= cutoff);
  }

  getSpeed(): number {
    if (this.samples.length < 2) return 0;
    const oldest = this.samples[0];
    const newest = this.samples[this.samples.length - 1];
    const timeDelta = (newest.timestamp - oldest.timestamp) / 1000; // seconds
    if (timeDelta <= 0) return 0;
    const bytesDelta = newest.bytes - oldest.bytes;
    return Math.max(0, bytesDelta / timeDelta);
  }

  reset(): void {
    this.samples = [];
  }
}

// ── Download Manager ───────────────────────────────────────
export class DownloadManager {
  private static instance: DownloadManager;
  private downloads: Map<string, DownloadItem> = new Map();
  private downloadTasks: Map<string, FileSystem.DownloadResumable> = new Map();
  private listeners: Map<string, ((progress: DownloadProgress) => void)[]> = new Map();
  private speedTrackers: Map<string, SpeedTracker> = new Map();
  private queue: string[] = []; // ordered IDs of queued downloads
  private queueOrderCounter = 0;
  private defaultDownloadPath: string | null = null;

  static getInstance(): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager();
    }
    return DownloadManager.instance;
  }

  // ── Initialization ─────────────────────────────────────
  async initialize(): Promise<void> {
    await this.loadDownloads();
    await this.loadDefaultDownloadPath();
    this.restoreQueue();
  }

  private async loadDownloads(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOAD_HISTORY);
      if (stored) {
        const downloads: DownloadItem[] = JSON.parse(stored);
        // Compute max queueOrder so counter starts above all persisted values
        let maxOrder = 0;
        downloads.forEach((d) => {
          this.downloads.set(d.id, d);
          if (d.queueOrder > maxOrder) maxOrder = d.queueOrder;
        });
        this.queueOrderCounter = maxOrder + 1;
      }

      // Restore queue order
      const queueStored = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOAD_QUEUE_ORDER);
      if (queueStored) {
        this.queue = JSON.parse(queueStored);
      }
    } catch (error) {
      console.error('Failed to load downloads:', error);
    }
  }

  private async loadDefaultDownloadPath(): Promise<void> {
    try {
      const path = await AsyncStorage.getItem(STORAGE_KEYS.DEFAULT_DOWNLOAD_PATH);
      if (path) {
        this.defaultDownloadPath = path;
      }
    } catch (error) {
      console.error('Failed to load default download path:', error);
    }
  }

  /**
   * On app restart, any item that was DOWNLOADING when the app was killed
   * gets reset to QUEUED and pushed to the front of the queue.
   * Then processQueue fires to start up to MAX_CONCURRENT.
   */
  private restoreQueue(): void {
    // Items that were mid-download → reset to queued
    for (const [id, item] of this.downloads) {
      if (item.status === DOWNLOAD_STATUS.DOWNLOADING || item.status === DOWNLOAD_STATUS.PENDING) {
        item.status = DOWNLOAD_STATUS.QUEUED;
        item.speed = 0;
        item.timeRemaining = 0;
        this.downloads.set(id, item);
        // Add to front of queue if not already there
        if (!this.queue.includes(id)) {
          this.queue.unshift(id);
        }
      }
    }

    // Clean queue of IDs that no longer exist or aren't queued
    this.queue = this.queue.filter(id => {
      const item = this.downloads.get(id);
      return item && item.status === DOWNLOAD_STATUS.QUEUED;
    });

    this.saveDownloads();
    this.processQueue();
  }

  // ── Persistence ────────────────────────────────────────
  private async saveDownloads(): Promise<void> {
    try {
      const downloads = Array.from(this.downloads.values());
      await AsyncStorage.setItem(STORAGE_KEYS.DOWNLOAD_HISTORY, JSON.stringify(downloads));
      await AsyncStorage.setItem(STORAGE_KEYS.DOWNLOAD_QUEUE_ORDER, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save downloads:', error);
    }
  }

  // ── Queue Logic ────────────────────────────────────────
  private getActiveCount(): number {
    let count = 0;
    for (const item of this.downloads.values()) {
      if (item.status === DOWNLOAD_STATUS.DOWNLOADING) count++;
    }
    return count;
  }

  /**
   * Drain loop: while we have capacity and queued items,
   * shift the next ID and fire-and-forget executeDownload.
   */
  private processQueue(): void {
    while (this.getActiveCount() < DOWNLOAD_CONFIG.MAX_CONCURRENT && this.queue.length > 0) {
      const nextId = this.queue.shift()!;
      const item = this.downloads.get(nextId);
      if (!item || item.status !== DOWNLOAD_STATUS.QUEUED) continue;
      // Fire-and-forget
      this.executeDownload(nextId);
    }
    // Save updated queue
    this.saveDownloads();
  }

  /**
   * Actually starts the download network request.
   * On completion/failure, calls processQueue to fill the freed slot.
   */
  private async executeDownload(id: string): Promise<void> {
    if (Platform.OS === 'web') {
      return this.executeDownloadWeb(id);
    }
    return this.executeDownloadNative(id);
  }

  /** Native download via expo-file-system DownloadResumable */
  private async executeDownloadNative(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item) return;

    const tracker = new SpeedTracker();
    this.speedTrackers.set(id, tracker);

    // Always download to internal cache first (reliable, no permission issues)
    const cachePath = `${FileSystem.cacheDirectory}${item.name}`;

    const downloadResumable = FileSystem.createDownloadResumable(
      item.url,
      cachePath,
      {},
      (progress) => {
        this.handleProgress(id, progress);
      }
    );

    this.downloadTasks.set(id, downloadResumable);

    // Mark as downloading
    item.status = DOWNLOAD_STATUS.DOWNLOADING;
    item.localPath = cachePath;
    item.startTime = Date.now();
    item.error = undefined;
    this.downloads.set(id, item);
    this.saveDownloads();

    try {
      const result = await downloadResumable.downloadAsync();

      if (result && result.uri) {
        // Move to final location (Download/FTPDownloader or MediaLibrary)
        await this.moveToFinalLocation(item, result.uri);

        item.status = DOWNLOAD_STATUS.COMPLETED;
        item.progress = 100;
        item.endTime = Date.now();
        item.speed = 0;
        item.timeRemaining = 0;
      } else {
        throw new Error('Download failed — no result');
      }
    } catch (error: any) {
      if (item.status === DOWNLOAD_STATUS.DOWNLOADING) {
        const errorMsg = error.message || 'Unknown error';
        // Connection abort = app was backgrounded. Mark as paused so user can retry.
        const isConnectionAbort =
          errorMsg.includes('connection abort') ||
          errorMsg.includes('Connection reset') ||
          errorMsg.includes('ECONNRESET');
        if (isConnectionAbort) {
          item.status = DOWNLOAD_STATUS.PAUSED;
          item.error = undefined;
        } else {
          item.status = DOWNLOAD_STATUS.FAILED;
          item.error = errorMsg;
        }
        item.speed = 0;
        item.timeRemaining = 0;
      }
    } finally {
      this.downloads.set(id, item);
      this.speedTrackers.delete(id);
      this.downloadTasks.delete(id);
      this.saveDownloads();
      this.processQueue();
    }
  }

  /**
   * Move completed download to final storage location.
   * Tries: 1) External Download/FTPDownloader  2) MediaLibrary album  3) Keep in cache
   */
  private async moveToFinalLocation(item: DownloadItem, sourceUri: string): Promise<void> {
    if (Platform.OS !== 'android') {
      item.localPath = sourceUri;
      return;
    }

    // If user set a custom SAF path, use it as-is (files already download to cache)
    if (this.defaultDownloadPath && this.defaultDownloadPath.startsWith('content://')) {
      // For SAF URIs, fall back to MediaLibrary album approach
      await this.saveToMediaLibraryAlbum(item, sourceUri);
      return;
    }

    // Approach 1: Direct move to /Download/FTPDownloader/
    try {
      const extDir = 'file:///storage/emulated/0/Download/FTPDownloader/';
      await FileSystem.makeDirectoryAsync(extDir, { intermediates: true });
      const dest = extDir + item.name;
      await FileSystem.moveAsync({ from: sourceUri, to: dest });
      item.localPath = dest;
      return;
    } catch {
      // Scoped storage may block this — fall through
    }

    // Approach 2: MediaLibrary album
    await this.saveToMediaLibraryAlbum(item, sourceUri);
  }

  private async saveToMediaLibraryAlbum(item: DownloadItem, sourceUri: string): Promise<void> {
    try {
      const asset = await MediaLibrary.createAssetAsync(sourceUri);
      try {
        const album = await MediaLibrary.getAlbumAsync('FTPDownloader');
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
          await MediaLibrary.createAlbumAsync('FTPDownloader', asset, false);
        }
      } catch {
        // Album creation failed — asset is still in DCIM, which is OK
      }
      item.localPath = asset.uri;
    } catch (e) {
      console.warn('MediaLibrary save failed, file stays in cache:', e);
      item.localPath = sourceUri;
    }
  }

  /**
   * Web download — opens file URL directly in the browser via anchor click.
   * This bypasses CORS restrictions since we're not using fetch().
   * Progress tracking isn't possible this way, but the download actually works
   * regardless of whether the server sends CORS headers.
   */
  private async executeDownloadWeb(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item) return;

    // Mark as downloading
    item.status = DOWNLOAD_STATUS.DOWNLOADING;
    item.startTime = Date.now();
    item.error = undefined;
    this.downloads.set(id, item);
    this.saveDownloads();

    try {
      // Trigger browser's native download via anchor click — not subject to CORS
      const a = document.createElement('a');
      a.href = item.url;
      a.download = item.name;
      // target=_blank prevents the current page from navigating away
      // if the server sends inline content-disposition
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Mark as completed immediately since we can't track browser download progress
      item.status = DOWNLOAD_STATUS.COMPLETED;
      item.progress = 100;
      item.endTime = Date.now();
      item.speed = 0;
      item.timeRemaining = 0;
    } catch (error: any) {
      item.status = DOWNLOAD_STATUS.FAILED;
      item.error = error.message || 'Failed to initiate download';
      item.speed = 0;
      item.timeRemaining = 0;
    } finally {
      this.downloads.set(id, item);
      this.saveDownloads();
      this.processQueue();
    }
  }

  // ── Progress Handling ──────────────────────────────────
  private handleProgress(id: string, progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }): void {
    const item = this.downloads.get(id);
    if (!item) return;

    const { totalBytesWritten, totalBytesExpectedToWrite } = progress;
    const percentage = totalBytesExpectedToWrite > 0
      ? Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)
      : 0;

    item.downloadedBytes = totalBytesWritten;
    item.totalBytes = totalBytesExpectedToWrite;
    item.progress = percentage;

    // Feed speed tracker
    const tracker = this.speedTrackers.get(id);
    if (tracker) {
      tracker.addSample(totalBytesWritten);
      const speed = tracker.getSpeed();
      item.speed = speed;

      // Calculate time remaining
      if (speed > 0 && totalBytesExpectedToWrite > 0) {
        const remaining = totalBytesExpectedToWrite - totalBytesWritten;
        item.timeRemaining = remaining / speed;
      } else {
        item.timeRemaining = 0;
      }
    }

    this.downloads.set(id, item);

    // Notify listeners
    const listeners = this.listeners.get(id) || [];
    listeners.forEach(callback => {
      callback({
        bytesDownloaded: totalBytesWritten,
        bytesTotal: totalBytesExpectedToWrite,
        percentage,
        speed: item.speed,
        timeRemaining: item.timeRemaining,
      });
    });
  }

  // ── Public API ─────────────────────────────────────────

  /**
   * Enqueue a download. Returns ID immediately.
   * If there's a free slot, starts executing right away.
   * Otherwise sets status to QUEUED.
   */
  async startDownload(
    url: string,
    filename: string,
    category: string
  ): Promise<string> {
    // Request permissions (non-blocking on web)
    if (Platform.OS !== 'web') {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Storage permission not granted');
      }
    }

    const id = this.generateId();
    const downloadPath = this.getDownloadPath(filename);

    const downloadItem: DownloadItem = {
      id,
      name: filename,
      url,
      localPath: downloadPath,
      status: DOWNLOAD_STATUS.QUEUED,
      progress: 0,
      totalBytes: 0,
      downloadedBytes: 0,
      startTime: Date.now(),
      speed: 0,
      timeRemaining: 0,
      queueOrder: this.queueOrderCounter++,
      category,
    };

    this.downloads.set(id, downloadItem);

    if (this.getActiveCount() < DOWNLOAD_CONFIG.MAX_CONCURRENT) {
      // Slot available — start immediately (fire-and-forget)
      this.executeDownload(id);
    } else {
      // No slot — queue it
      this.queue.push(id);
      this.saveDownloads();
    }

    return id;
  }

  async pauseDownload(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item || item.status !== DOWNLOAD_STATUS.DOWNLOADING) return;

    // Web downloads complete instantly (anchor click), so pause doesn't apply
    if (Platform.OS === 'web') return;

    const task = this.downloadTasks.get(id);
    if (task) {
      try {
        await task.pauseAsync();
        item.status = DOWNLOAD_STATUS.PAUSED;
        item.speed = 0;
        item.timeRemaining = 0;
        this.downloads.set(id, item);
        this.speedTrackers.delete(id);
        await this.saveDownloads();
        this.processQueue();
      } catch (error) {
        console.error('Failed to pause download:', error);
      }
    }
  }

  async resumeDownload(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item || item.status !== DOWNLOAD_STATUS.PAUSED) return;

    if (Platform.OS === 'web') {
      // Web downloads are instant (anchor click) — just re-trigger
      item.status = DOWNLOAD_STATUS.QUEUED;
      item.progress = 0;
      item.downloadedBytes = 0;
      item.speed = 0;
      item.timeRemaining = 0;
      this.downloads.set(id, item);
      this.executeDownload(id);
      return;
    }

    const task = this.downloadTasks.get(id);

    if (this.getActiveCount() < DOWNLOAD_CONFIG.MAX_CONCURRENT) {
      if (task) {
        // Slot available + task exists — resume the existing DownloadResumable
        try {
          const tracker = new SpeedTracker();
          this.speedTrackers.set(id, tracker);

          item.status = DOWNLOAD_STATUS.DOWNLOADING;
          this.downloads.set(id, item);
          await this.saveDownloads();

          task.resumeAsync().then(result => {
            if (result && result.uri) {
              this.moveToFinalLocation(item, result.uri).then(() => {
                item.status = DOWNLOAD_STATUS.COMPLETED;
                item.progress = 100;
                item.endTime = Date.now();
                item.speed = 0;
                item.timeRemaining = 0;
                this.downloads.set(id, item);
                this.speedTrackers.delete(id);
                this.downloadTasks.delete(id);
                this.saveDownloads();
                this.processQueue();
              });
            }
          }).catch((error: any) => {
            if (item.status === DOWNLOAD_STATUS.DOWNLOADING) {
              item.status = DOWNLOAD_STATUS.FAILED;
              item.error = error.message || 'Unknown error';
              item.speed = 0;
              item.timeRemaining = 0;
              this.downloads.set(id, item);
              this.speedTrackers.delete(id);
              this.downloadTasks.delete(id);
              this.saveDownloads();
              this.processQueue();
            }
          });
        } catch (error) {
          console.error('Failed to resume download:', error);
        }
      } else {
        // Slot available but task was lost (e.g. connection abort cleaned it up)
        // Restart the download from scratch
        item.progress = 0;
        item.downloadedBytes = 0;
        item.speed = 0;
        item.timeRemaining = 0;
        item.error = undefined;
        item.status = DOWNLOAD_STATUS.QUEUED;
        this.downloads.set(id, item);
        this.executeDownload(id);
      }
    } else {
      // No slot available — re-queue and process
      item.status = DOWNLOAD_STATUS.QUEUED;
      item.speed = 0;
      item.timeRemaining = 0;
      this.downloads.set(id, item);
      if (!this.queue.includes(id)) {
        this.queue.push(id);
      }
      await this.saveDownloads();
      this.processQueue();
    }
  }

  async cancelDownload(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item) return;

    if (item.status === DOWNLOAD_STATUS.QUEUED) {
      // Just remove from queue — no slot effect
      this.queue = this.queue.filter(qid => qid !== id);
      item.status = DOWNLOAD_STATUS.CANCELLED;
      item.speed = 0;
      item.timeRemaining = 0;
      this.downloads.set(id, item);
      await this.saveDownloads();
      return;
    }

    // Cancel native task
    const task = this.downloadTasks.get(id);
    if (task) {
      try { await task.cancelAsync(); } catch (_) {}
    }

    item.status = DOWNLOAD_STATUS.CANCELLED;
    item.speed = 0;
    item.timeRemaining = 0;
    this.downloads.set(id, item);
    this.downloadTasks.delete(id);
    this.speedTrackers.delete(id);
    await this.saveDownloads();
    // Freed slot → process queue
    this.processQueue();
  }

  async retryDownload(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item || (item.status !== DOWNLOAD_STATUS.FAILED && item.status !== DOWNLOAD_STATUS.CANCELLED)) return;

    // Reset progress/error, reuse same ID
    item.progress = 0;
    item.downloadedBytes = 0;
    item.totalBytes = 0;
    item.error = undefined;
    item.endTime = undefined;
    item.speed = 0;
    item.timeRemaining = 0;
    item.queueOrder = this.queueOrderCounter++;

    if (this.getActiveCount() < DOWNLOAD_CONFIG.MAX_CONCURRENT) {
      // Slot available — execute immediately
      item.status = DOWNLOAD_STATUS.QUEUED; // executeDownload will set to DOWNLOADING
      this.downloads.set(id, item);
      this.executeDownload(id);
    } else {
      // Queue it
      item.status = DOWNLOAD_STATUS.QUEUED;
      this.downloads.set(id, item);
      if (!this.queue.includes(id)) {
        this.queue.push(id);
      }
      await this.saveDownloads();
    }
  }

  async deleteDownload(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item) return;

    // Cancel if active (native)
    const task = this.downloadTasks.get(id);
    if (task) {
      try { await task.cancelAsync(); } catch (_) {}
    }
    // Remove from queue
    this.queue = this.queue.filter(qid => qid !== id);

    // Delete local file (native only)
    try {
      if (item.localPath && Platform.OS !== 'web') {
        await FileSystem.deleteAsync(item.localPath, { idempotent: true });
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
    }

    this.downloads.delete(id);
    this.downloadTasks.delete(id);
    this.speedTrackers.delete(id);
    this.listeners.delete(id);
    await this.saveDownloads();
  }

  // ── Download path management ───────────────────────────
  private getDownloadPath(filename: string): string {
    const base = this.defaultDownloadPath || FileSystem.documentDirectory || '';
    // Ensure trailing slash
    const dir = base.endsWith('/') ? base : base + '/';
    return `${dir}${filename}`;
  }

  async setDefaultDownloadPath(path: string | null): Promise<void> {
    this.defaultDownloadPath = path;
    try {
      if (path) {
        await AsyncStorage.setItem(STORAGE_KEYS.DEFAULT_DOWNLOAD_PATH, path);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.DEFAULT_DOWNLOAD_PATH);
      }
    } catch (error) {
      console.error('Failed to save default download path:', error);
    }
  }

  getDefaultDownloadPath(): string {
    return this.defaultDownloadPath || FileSystem.documentDirectory || '';
  }

  // ── Getters ────────────────────────────────────────────
  getDownload(id: string): DownloadItem | undefined {
    return this.downloads.get(id);
  }

  getAllDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values());
  }

  getActiveDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values()).filter(
      item => item.status === DOWNLOAD_STATUS.DOWNLOADING ||
              item.status === DOWNLOAD_STATUS.QUEUED ||
              item.status === DOWNLOAD_STATUS.PENDING
    );
  }

  getQueuedCount(): number {
    return this.queue.length;
  }

  getDownloadingCount(): number {
    return this.getActiveCount();
  }

  // ── Listeners ──────────────────────────────────────────
  subscribeToProgress(id: string, callback: (progress: DownloadProgress) => void): () => void {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, []);
    }
    this.listeners.get(id)!.push(callback);

    return () => {
      const listeners = this.listeners.get(id);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  // ── Bulk operations ────────────────────────────────────
  async clearCompletedDownloads(): Promise<void> {
    const completed = Array.from(this.downloads.values()).filter(
      item => item.status === DOWNLOAD_STATUS.COMPLETED ||
              item.status === DOWNLOAD_STATUS.CANCELLED
    );

    for (const item of completed) {
      await this.deleteDownload(item.id);
    }
  }

  // ── Helpers ────────────────────────────────────────────
  private generateId(): string {
    return `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const downloadManager = DownloadManager.getInstance();
