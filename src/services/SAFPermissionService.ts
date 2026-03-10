import * as FileSystem from 'expo-file-system/legacy';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';

const { SAFPermissionsModule } = NativeModules;

interface SAFPermissionResult {
  granted: boolean;
  uri?: string;
  error?: string;
}

interface SAFWriteResult {
  success: boolean;
  uri?: string;
  error?: string;
}

/**
 * Service for managing SAF (Storage Access Framework) persistent URI permissions
 * Implements 1DM-style one-time folder selection with persistent access
 */
export class SAFPermissionService {
  private static instance: SAFPermissionService;
  private safDirectoryUri: string | null = null;
  private isInitialized = false;

  static getInstance(): SAFPermissionService {
    if (!SAFPermissionService.instance) {
      SAFPermissionService.instance = new SAFPermissionService();
    }
    return SAFPermissionService.instance;
  }

  /**
   * Initialize the service - load persisted URI from AsyncStorage
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const storedUri = await AsyncStorage.getItem(STORAGE_KEYS.SAF_DIRECTORY_URI);
      if (storedUri) {
        this.safDirectoryUri = storedUri;
        console.log('📂 Loaded SAF URI from storage:', storedUri);
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize SAFPermissionService:', error);
    }
  }

  /**
   * Check if SAF is supported on this device (Android 5.0+)
   */
  async isSAFSupported(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    try {
      if (!SAFPermissionsModule) {
        console.warn('⚠️ SAFPermissionsModule not available');
        return false;
      }
      return await SAFPermissionsModule.isSAFSupported();
    } catch (error) {
      console.error('Failed to check SAF support:', error);
      return false;
    }
  }

  /**
   * Request folder access from user and persist the permission
   * This is the one-time setup that 1DM does on first launch
   */
  async requestFolderAccess(initialUri?: string): Promise<SAFPermissionResult> {
    if (Platform.OS !== 'android') {
      return { granted: false, error: 'SAF only available on Android' };
    }

    // Check if SAF is supported
    const supported = await this.isSAFSupported();
    if (!supported) {
      return { granted: false, error: 'SAF not supported on this device' };
    }

    try {
      console.log('📁 Requesting SAF folder access...');

      // Request directory permissions using Expo SAF API
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
        initialUri
      );

      if (!permissions.granted) {
        console.log('❌ User denied folder access');
        return { granted: false, error: 'User denied access' };
      }

      const uri = permissions.directoryUri;
      console.log('✓ Folder access granted:', uri);

      // 🔑 KEY STEP: Persist the URI permission using native module
      try {
        await SAFPermissionsModule.takePersistableUriPermission(uri);
        console.log('✓ URI permission persisted');
      } catch (error: any) {
        console.error('Failed to persist URI permission:', error);
        return {
          granted: false,
          error: `Failed to persist permission: ${error.message}`,
        };
      }

      // Save URI to AsyncStorage for quick access
      await AsyncStorage.setItem(STORAGE_KEYS.SAF_DIRECTORY_URI, uri);
      this.safDirectoryUri = uri;

      console.log('✓ SAF setup complete!');
      return { granted: true, uri };
    } catch (error: any) {
      console.error('SAF folder access failed:', error);
      return {
        granted: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Validate that the persisted URI permission is still valid
   * Called on app startup to ensure folder is still accessible
   */
  async validatePersistedPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    if (!this.safDirectoryUri) return false;

    try {
      console.log('🔍 Validating persisted SAF permission...');

      // Check if we still have the persisted permission
      const hasPermission = await SAFPermissionsModule.checkUriPermission(
        this.safDirectoryUri
      );

      if (!hasPermission) {
        console.log('❌ Persisted permission no longer valid');
        // Clear invalid URI
        await this.clearSAFUri();
        return false;
      }

      // Try to read directory to verify access
      try {
        const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(
          this.safDirectoryUri
        );
        console.log(`✓ SAF permission valid (${files.length} files in directory)`);
        return true;
      } catch (error) {
        console.warn('⚠️ Permission exists but directory unreadable:', error);
        await this.clearSAFUri();
        return false;
      }
    } catch (error) {
      console.error('Failed to validate SAF permission:', error);
      await this.clearSAFUri();
      return false;
    }
  }

  /**
   * Get current SAF directory URI (from memory or AsyncStorage)
   */
  getSAFDirectoryUri(): string | null {
    return this.safDirectoryUri;
  }

  /**
   * Check if SAF is configured and ready to use
   */
  isSAFConfigured(): boolean {
    return this.safDirectoryUri !== null;
  }

  /**
   * Write a file from cache to SAF directory
   * Uses native streaming copy to avoid OOM errors with large files
   */
  async writeFileToSAF(
    cacheUri: string,
    filename: string
  ): Promise<SAFWriteResult> {
    if (Platform.OS !== 'android') {
      return { success: false, error: 'SAF only available on Android' };
    }

    if (!this.safDirectoryUri) {
      return { success: false, error: 'SAF not configured' };
    }

    try {
      console.log(`📝 [SAF WRITE START] Copying file to SAF: ${filename}`);
      console.log(`   Cache URI: ${cacheUri}`);
      console.log(`   SAF Directory: ${this.safDirectoryUri}`);

      // Check cache file exists and get its size
      const cacheInfo = await FileSystem.getInfoAsync(cacheUri);
      console.log(`   Cache file info:`, cacheInfo);

      if (!cacheInfo.exists) {
        console.error('❌ Cache file does not exist!');
        return { success: false, error: 'Cache file does not exist' };
      }

      console.log(`   Cache file size: ${cacheInfo.size} bytes`);

      // Use native module to copy file efficiently (streaming, no OOM)
      const mimeType = this.getMimeType(filename);
      console.log(`   Copying via native streaming (MIME: ${mimeType})...`);

      const result = await SAFPermissionsModule.copyFileToSAF(
        cacheUri,
        this.safDirectoryUri,
        filename,
        mimeType
      );

      console.log(`✓ File copied successfully: ${result.uri}`);
      console.log(`   Final size: ${result.size} bytes`);

      // Verify sizes match
      if (cacheInfo.size && result.size !== cacheInfo.size) {
        console.warn(`⚠️ Size mismatch: cache=${cacheInfo.size}, SAF=${result.size}`);
      }

      // Clean up cache file
      try {
        await FileSystem.deleteAsync(cacheUri, { idempotent: true });
        console.log('✓ Cache file cleaned up');
      } catch (error) {
        console.warn('⚠️ Failed to clean cache:', error);
      }

      console.log(`📝 [SAF WRITE SUCCESS] Final URI: ${result.uri}`);
      return { success: true, uri: result.uri };
    } catch (error: any) {
      console.error('❌ [SAF WRITE FAILED] Error:', error);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Delete a file from SAF directory
   * Called when user deletes download from app
   */
  async deleteFileFromSAF(fileUri: string): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    try {
      console.log(`🗑️ Deleting SAF file: ${fileUri}`);
      const deleted = await SAFPermissionsModule.deleteFileFromSAF(fileUri);
      console.log(deleted ? '✓ File deleted' : '⚠️ File not deleted');
      return deleted;
    } catch (error: any) {
      console.error('❌ Failed to delete SAF file:', error);
      return false;
    }
  }

  /**
   * Release the current persistent permission
   * Use when user wants to change folder
   */
  async releaseCurrentPermission(): Promise<void> {
    if (Platform.OS !== 'android') return;
    if (!this.safDirectoryUri) return;

    try {
      console.log('🔓 Releasing SAF permission...');
      await SAFPermissionsModule.releasePersistableUriPermission(this.safDirectoryUri);
      await this.clearSAFUri();
      console.log('✓ Permission released');
    } catch (error) {
      console.error('Failed to release permission:', error);
      // Clear anyway
      await this.clearSAFUri();
    }
  }

  /**
   * Clear SAF URI from memory and storage
   */
  private async clearSAFUri(): Promise<void> {
    this.safDirectoryUri = null;
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.SAF_DIRECTORY_URI);
    } catch (error) {
      console.error('Failed to clear SAF URI from storage:', error);
    }
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();

    const mimeTypes: Record<string, string> = {
      mp4: 'video/mp4',
      mkv: 'video/x-matroska',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      wmv: 'video/x-ms-wmv',
      flv: 'video/x-flv',
      webm: 'video/webm',
      m4v: 'video/mp4',
      srt: 'application/x-subrip',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      pdf: 'application/pdf',
      txt: 'text/plain',
      zip: 'application/zip',
    };

    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Get human-readable folder name from SAF URI
   * Extracts last path component for display purposes
   */
  getFolderDisplayName(): string {
    if (!this.safDirectoryUri) return 'Not configured';

    try {
      // SAF URIs look like: content://com.android.externalstorage.documents/tree/primary%3ADownload%2FFTPDownloader
      // We want to extract "Download/FTPDownloader"
      const uri = decodeURIComponent(this.safDirectoryUri);
      const match = uri.match(/tree\/[^:]+:(.+)$/);
      if (match) {
        return match[1].replace(/%2F/g, '/');
      }
      return this.safDirectoryUri;
    } catch (error) {
      return this.safDirectoryUri;
    }
  }

  /**
   * Get permission usage statistics
   * Useful for debugging and showing warnings
   */
  async getPermissionStats(): Promise<{
    currentCount: number;
    maxPermissions: number;
    remaining: number;
    nearLimit: boolean;
  } | null> {
    if (Platform.OS !== 'android') return null;

    try {
      return await SAFPermissionsModule.getPermissionLimits();
    } catch (error) {
      console.error('Failed to get permission stats:', error);
      return null;
    }
  }
}

export const safPermissionService = SAFPermissionService.getInstance();
