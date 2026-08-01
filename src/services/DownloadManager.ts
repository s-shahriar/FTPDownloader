import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { DOWNLOAD_STATUS, DOWNLOAD_CONFIG, STORAGE_KEYS } from '../constants';
import { DownloadItem, DownloadProgress } from '../types';
import { notificationService } from './NotificationService';
import { safPermissionService } from './SAFPermissionService';

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
  private lastNotificationTime: Map<string, number> = new Map(); // throttle notifications

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
    
    // Connect custom notification actions back to download manager
    notificationService.onPauseAction = (id) => this.pauseDownload(id);
    notificationService.onResumeAction = (id) => this.resumeDownload(id);
    notificationService.onCancelAction = (id) => this.cancelDownload(id);
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
   * On app restart, anything that was mid-flight is parked as PAUSED.
   * The partial file is still in the cache directory, so resuming picks up
   * from its current length — never from zero.
   */
  private restoreQueue(): void {
    for (const [id, item] of this.downloads) {
      if (
        item.status === DOWNLOAD_STATUS.DOWNLOADING ||
        item.status === DOWNLOAD_STATUS.PENDING ||
        item.status === DOWNLOAD_STATUS.SAVING
      ) {
        item.status = DOWNLOAD_STATUS.PAUSED;
        item.speed = 0;
        item.timeRemaining = 0;
        this.downloads.set(id, item);
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

  /** Cache path a download streams into before it is saved to public storage. */
  private getTempPath(item: DownloadItem): string {
    return `${FileSystem.cacheDirectory}${item.name}`;
  }

  /**
   * Byte length of a partial file, or 0 if there isn't one.
   *
   * On Android expo's `resumeData` is exactly this number as a string:
   * FileSystemLegacyModule sends `Range: bytes=<n>-` and opens the file in
   * append mode whenever resumeData is non-null, and truncates when it isn't.
   */
  private async getBytesOnDisk(fileUri: string): Promise<number> {
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      return info.exists && !info.isDirectory ? info.size ?? 0 : 0;
    } catch {
      return 0;
    }
  }

  /**
   * The single entry point for both starting and resuming a native download.
   *
   * Expo only ever populates `resumeData` inside `pauseAsync()`, so after a
   * dropped connection or a killed process it is undefined — and starting
   * without it truncates the partial file and re-downloads from 0%. Deriving
   * the offset from the file on disk is correct no matter how the last attempt
   * ended, so every path through here resumes.
   */
  private async executeDownloadNative(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item) return;

    // Claim the concurrency slot synchronously. processQueue's drain loop
    // counts DOWNLOADING items and keeps looping until the cap is reached — if
    // the first await here lands before the status is set, it starts the whole
    // queue at once.
    item.status = DOWNLOAD_STATUS.DOWNLOADING;
    item.error = undefined;
    this.downloads.set(id, item);

    const tempPath = this.getTempPath(item);
    const offset = await this.getBytesOnDisk(tempPath);

    // Already have every byte — asking for `bytes=<size>-` would earn a 416
    // whose error body gets appended to the file. Go straight to saving.
    if (offset > 0 && item.totalBytes > 0 && offset >= item.totalBytes) {
      await this.completeDownload(id, tempPath);
      await this.saveDownloads();
      this.processQueue();
      return;
    }

    const resumeData = offset > 0 ? String(offset) : undefined;

    const downloadResumable = FileSystem.createDownloadResumable(
      item.url,
      tempPath,
      {},
      (progress) => {
        this.handleProgress(id, progress);
      },
      resumeData
    );

    this.downloadTasks.set(id, downloadResumable);
    this.speedTrackers.set(id, new SpeedTracker());

    item.status = DOWNLOAD_STATUS.DOWNLOADING;
    item.localPath = tempPath;
    item.resumeData = resumeData;
    item.error = undefined;
    if (offset > 0) {
      item.downloadedBytes = offset;
    } else {
      item.downloadedBytes = 0;
      item.progress = 0;
      item.startTime = Date.now();
    }
    this.downloads.set(id, item);
    await this.saveDownloads();

    if (offset > 0) {
      console.log(`▶️ [DOWNLOAD] Resuming "${item.name}" from byte ${offset}`);
      await notificationService.onDownloadResumed(id, item.name);
    } else {
      await notificationService.onDownloadStart(id, item.name, item.category);
    }

    try {
      const result = await downloadResumable.downloadAsync();

      // pauseAsync()/cancelAsync() cancel the underlying call, which makes the
      // native promise resolve null rather than reject. That isn't a failure —
      // the pause/cancel handler already owns the status.
      if (!result || !result.uri) return;

      await this.completeDownload(id, result.uri);
    } catch (error: any) {
      // Server down, connection dropped, timeout, DNS — all the same thing:
      // stop here and keep the bytes. No error-string matching.
      await this.stallDownload(id, error?.message || 'Connection lost');
    } finally {
      this.speedTrackers.delete(id);
      this.lastNotificationTime.delete(id);
      const current = this.downloads.get(id);
      if (!current || current.status !== DOWNLOAD_STATUS.DOWNLOADING) {
        this.downloadTasks.delete(id);
      }
      await this.saveDownloads();
      this.processQueue();
    }
  }

  /**
   * Park an interrupted download as PAUSED with its bytes left intact.
   * Nothing needs storing to resume — the offset is re-read from disk.
   */
  private async stallDownload(
    id: string,
    reason: string,
    userInitiated: boolean = false
  ): Promise<void> {
    const item = this.downloads.get(id);
    if (!item) return;
    // Don't resurrect something the user already cancelled, or clobber a
    // status pauseDownload/cancelDownload has already settled.
    if (
      item.status === DOWNLOAD_STATUS.CANCELLED ||
      item.status === DOWNLOAD_STATUS.COMPLETED ||
      item.status === DOWNLOAD_STATUS.PAUSED
    ) {
      return;
    }

    const bytes = await this.getBytesOnDisk(this.getTempPath(item));
    item.status = DOWNLOAD_STATUS.PAUSED;
    item.error = userInitiated ? undefined : reason;
    item.resumeData = bytes > 0 ? String(bytes) : undefined;
    item.downloadedBytes = bytes;
    item.speed = 0;
    item.timeRemaining = 0;
    this.downloads.set(id, item);
    this.downloadTasks.delete(id);

    console.log(`⏸️ [DOWNLOAD] "${item.name}" stopped at byte ${bytes} — ${reason}`);
    await notificationService.onDownloadPaused(id, item.name);
  }

  /**
   * Check the file is whole, then copy it into public storage.
   *
   * Copying a multi-GB movie is slow, so it gets its own status rather than
   * sitting at 100% "downloading" and looking hung.
   */
  private async completeDownload(id: string, cacheUri: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item) return;

    const bytes = await this.getBytesOnDisk(cacheUri);

    // Short file means the transfer ended early. Treat it as an interruption
    // instead of saving a truncated movie for the user to discover later.
    if (item.totalBytes > 0 && bytes < item.totalBytes) {
      await this.stallDownload(id, `Incomplete — ${bytes} of ${item.totalBytes} bytes`);
      return;
    }

    // Overshooting means bytes got appended that shouldn't have been — a range
    // request the server answered with a full 200, or a 416 error body. The
    // file is unusable and its length is no longer a valid resume offset, so
    // throw it away and start clean rather than saving garbage.
    if (item.totalBytes > 0 && bytes > item.totalBytes) {
      console.warn(`⚠️ [DOWNLOAD] "${item.name}" is ${bytes} bytes, expected ${item.totalBytes} — discarding`);
      try {
        await FileSystem.deleteAsync(cacheUri, { idempotent: true });
      } catch (_) {}
      item.progress = 0;
      item.downloadedBytes = 0;
      item.resumeData = undefined;
      this.downloads.set(id, item);
      await this.stallDownload(id, 'Corrupt partial file discarded — resume to restart');
      return;
    }

    item.status = DOWNLOAD_STATUS.SAVING;
    item.progress = 100;
    item.downloadedBytes = bytes;
    item.speed = 0;
    item.timeRemaining = 0;
    item.error = undefined;
    this.downloads.set(id, item);
    this.downloadTasks.delete(id);
    await this.saveDownloads();
    await notificationService.onDownloadSaving(id, item.name);

    try {
      const publicUri = await this.saveToStorage(cacheUri, item);
      item.status = DOWNLOAD_STATUS.COMPLETED;
      item.localPath = publicUri;
      item.endTime = Date.now();
      item.resumeData = undefined;
      this.downloads.set(id, item);
      await notificationService.onDownloadComplete(id, item.name);
    } catch (error: any) {
      // The bytes are downloaded and still in cache — only the copy failed, so
      // retrying re-saves rather than re-downloading gigabytes.
      const message = error?.message || 'Could not save file';
      item.status = DOWNLOAD_STATUS.FAILED;
      item.error = message;
      this.downloads.set(id, item);
      await notificationService.onDownloadFailed(id, item.name, message);
    }
  }

  /**
   * Move downloaded file from cache to Pictures/FTPDownloader using MediaLibrary
   * This makes files accessible via gallery and file managers
   */
  private async moveToPublicStorage(cacheUri: string, filename: string): Promise<string> {
    try {
      console.log('📦 Moving file to Pictures/FTPDownloader:', filename);

      // Save to media library (Pictures/Movies/Music depending on file type)
      const asset = await MediaLibrary.createAssetAsync(cacheUri);
      console.log('✓ Asset created:', asset.id);

      // Create/get FTPDownloader album
      const albumName = 'FTPDownloader';
      let album = await MediaLibrary.getAlbumAsync(albumName);

      if (!album) {
        // Create album with the asset
        album = await MediaLibrary.createAlbumAsync(albumName, asset, false);
        console.log('✓ Created album:', albumName);
      } else {
        // Add to existing album
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        console.log('✓ Added to album:', albumName);
      }

      // Get asset URI - handle case where getAssetInfoAsync might return null
      let publicUri: string;
      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
        publicUri = assetInfo?.localUri || assetInfo?.uri || asset.uri;
      } catch (e) {
        // Fallback to asset.uri if getAssetInfoAsync fails
        publicUri = asset.uri;
      }

      console.log('✓ File saved to:', publicUri);
      console.log('📂 Access via: Pictures/FTPDownloader album in gallery');

      // Clean up cache file
      try {
        await FileSystem.deleteAsync(cacheUri, { idempotent: true });
        console.log('✓ Cleaned up cache');
      } catch (e) {
        console.log('⚠️ Cache cleanup failed:', e);
      }

      return publicUri;
    } catch (error: any) {
      console.error('❌ Failed to save to gallery:', error);
      // Leave the cache file alone — the download is intact and re-saving it
      // is cheap, so surface the failure instead of quietly "completing" with
      // a file that only lives in a cache Android is free to purge.
      throw new Error(`Could not save to storage: ${error?.message || 'unknown error'}`);
    }
  }

  private async saveToStorage(cacheUri: string, item: DownloadItem): Promise<string> {
    let publicUri: string;
    const safUri = safPermissionService.getSAFDirectoryUri();
    console.log(`🔍 [STORAGE] SAF URI configured: ${safUri ? 'YES' : 'NO'}`);

    if (safUri) {
      console.log('📁 [STORAGE] Attempting SAF write...');
      console.log(`   Downloaded file URI: ${cacheUri}`);
      console.log(`   Target filename: ${item.name}`);

      try {
        const safResult = await safPermissionService.writeFileToSAF(cacheUri, item.name);
        console.log(`🔍 [STORAGE] SAF write result:`, safResult);

        if (safResult.success && safResult.uri) {
          publicUri = safResult.uri;
          console.log('✓ [STORAGE] File saved via SAF:', publicUri);
          return publicUri;
        } else {
          console.warn('⚠️ [STORAGE] SAF write failed, falling back to MediaLibrary', safResult.error);
        }
      } catch (error: any) {
        console.error('❌ [STORAGE] SAF write exception, falling back to MediaLibrary', error.message);
      }
    } else {
      console.log('📸 [STORAGE] SAF not configured, using MediaLibrary');
    }

    publicUri = await this.moveToPublicStorage(cacheUri, item.name);
    console.log('✓ [STORAGE] MediaLibrary save completed:', publicUri);
    return publicUri;
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

    // Update notification (throttled to every 2 seconds)
    const now = Date.now();
    const lastTime = this.lastNotificationTime.get(id) || 0;
    if (now - lastTime > 2000 && percentage > 0 && percentage < 100) {
      this.lastNotificationTime.set(id, now);
      
      // Persist progress periodically. Resume position is not stored here —
      // it is read back off the partial file, which cannot drift out of sync.
      this.downloads.set(id, item);
      this.saveDownloads();

      notificationService.onDownloadProgress({
        id,
        filename: item.name,
        progress: percentage,
        speed: item.speed,
        eta: item.timeRemaining,
        downloadedBytes: item.downloadedBytes,
        totalBytes: item.totalBytes,
        status: 'downloading',
        category: item.category,
      });
    }
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
      } catch (error) {
        // Task already dead (connection dropped a moment ago). The bytes on
        // disk are the source of truth either way, so park it regardless.
        console.warn('pauseAsync failed, parking download anyway:', error);
      }
    }

    await this.stallDownload(id, 'Paused', true);
    this.speedTrackers.delete(id);
    this.lastNotificationTime.delete(id);
    await this.saveDownloads();
    this.processQueue();
  }

  /**
   * Resume a stopped download.
   *
   * There is deliberately only one code path: executeDownloadNative reads the
   * offset off disk, so it makes no difference whether this download was paused
   * by hand, cut off by a dead server, or lost to a process restart.
   */
  async resumeDownload(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item) return;
    if (item.status !== DOWNLOAD_STATUS.PAUSED && item.status !== DOWNLOAD_STATUS.FAILED) return;

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

    // Throw away any stale task object — a fresh one is built with the
    // correct offset. Reusing one whose native call already failed cannot work.
    this.downloadTasks.delete(id);

    item.error = undefined;
    item.speed = 0;
    item.timeRemaining = 0;

    if (this.getActiveCount() < DOWNLOAD_CONFIG.MAX_CONCURRENT) {
      this.downloads.set(id, item);
      this.executeDownload(id);
    } else {
      // No slot — queue it. processQueue routes back through the same resume
      // path, so waiting for a slot never costs the bytes already downloaded.
      item.status = DOWNLOAD_STATUS.QUEUED;
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
      this.lastNotificationTime.delete(id);
      await notificationService.dismissDownloadNotification(id);
      await this.saveDownloads();
      return;
    }

    // Cancel native task
    const task = this.downloadTasks.get(id);
    if (task) {
      try { await task.cancelAsync(); } catch (_) {}
    }

    // Drop the partial file. Cancel means "forget this", so a later retry must
    // start clean rather than resuming into bytes the user threw away.
    try {
      await FileSystem.deleteAsync(this.getTempPath(item), { idempotent: true });
    } catch (_) {}

    item.status = DOWNLOAD_STATUS.CANCELLED;
    item.progress = 0;
    item.downloadedBytes = 0;
    item.resumeData = undefined;
    item.speed = 0;
    item.timeRemaining = 0;
    this.downloads.set(id, item);
    this.downloadTasks.delete(id);
    this.speedTrackers.delete(id);
    this.lastNotificationTime.delete(id);
    await notificationService.dismissDownloadNotification(id);
    await this.saveDownloads();
    // Freed slot → process queue
    this.processQueue();
  }

  async retryDownload(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item || (item.status !== DOWNLOAD_STATUS.FAILED && item.status !== DOWNLOAD_STATUS.CANCELLED)) return;

    // Progress is deliberately NOT reset. A retry after a failed save, or after
    // the server went away, picks up whatever is already in the cache file;
    // a cancelled item had its partial deleted, so it starts clean by itself.
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

  async deleteDownload(id: string, deleteFromDisk: boolean = true): Promise<void> {
    const item = this.downloads.get(id);
    if (!item) return;

    // Cancel if active (native)
    const task = this.downloadTasks.get(id);
    if (task) {
      try { await task.cancelAsync(); } catch (_) {}
    }
    // Remove from queue
    this.queue = this.queue.filter(qid => qid !== id);

    // Delete local file (native only) - optional based on parameter
    if (deleteFromDisk) {
      try {
        if (item.localPath && Platform.OS !== 'web') {
          // Check if this is a SAF URI (content://)
          if (item.localPath.startsWith('content://')) {
            console.log(`🗑️ Deleting SAF file: ${item.localPath}`);
            const deleted = await safPermissionService.deleteFileFromSAF(item.localPath);
            if (deleted) {
              console.log(`✓ SAF file deleted successfully`);
            } else {
              console.warn(`⚠️ Failed to delete SAF file (may already be deleted)`);
            }
          } else {
            // Regular file path (MediaLibrary or cache)
            const fileInfo = await FileSystem.getInfoAsync(item.localPath);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(item.localPath, { idempotent: true });
              console.log(`✓ Deleted file: ${item.localPath}`);
            } else {
              console.log(`⚠️ File doesn't exist: ${item.localPath}`);
            }
          }
        }
      } catch (error) {
        console.error('❌ Failed to delete file:', error);
        // Don't throw - allow download record to be removed even if file delete fails
      }
    } else {
      console.log('⊘ Keeping file on disk, only removing from download list');
    }

    this.downloads.delete(id);
    this.downloadTasks.delete(id);
    this.speedTrackers.delete(id);
    this.listeners.delete(id);
    this.lastNotificationTime.delete(id);
    await notificationService.dismissDownloadNotification(id);
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
  async clearCompletedDownloads(deleteFromDisk: boolean = true): Promise<void> {
    const completed = Array.from(this.downloads.values()).filter(
      item => item.status === DOWNLOAD_STATUS.COMPLETED ||
              item.status === DOWNLOAD_STATUS.CANCELLED
    );

    for (const item of completed) {
      await this.deleteDownload(item.id, deleteFromDisk);
    }
  }

  // ── Helpers ────────────────────────────────────────────
  private generateId(): string {
    return `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const downloadManager = DownloadManager.getInstance();
