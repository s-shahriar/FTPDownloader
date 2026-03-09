import * as MediaLibrary from 'expo-media-library';
import { Platform, Linking } from 'react-native';
import { showAlert } from '../components/AlertModal';

export class PermissionHandler {
  private static instance: PermissionHandler;
  private storagePermissionGranted: boolean = false;

  static getInstance(): PermissionHandler {
    if (!PermissionHandler.instance) {
      PermissionHandler.instance = new PermissionHandler();
    }
    return PermissionHandler.instance;
  }

  async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      
      if (status === 'granted') {
        this.storagePermissionGranted = true;
        return true;
      } else if (status === 'denied') {
        showAlert(
          'Storage Permission Required',
          'This app needs storage permission to download and save files. Please grant permission in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        return false;
      }
    }
    
    return true;
  }

  async checkStoragePermission(): Promise<boolean> {
    const { status } = await MediaLibrary.getPermissionsAsync();
    return status === 'granted';
  }

  async ensureStoragePermission(): Promise<boolean> {
    const hasPermission = await this.checkStoragePermission();
    
    if (!hasPermission) {
      return await this.requestStoragePermission();
    }
    
    this.storagePermissionGranted = true;
    return true;
  }

  isStoragePermissionGranted(): boolean {
    return this.storagePermissionGranted;
  }

  async requestAllPermissions(): Promise<{ storage: boolean }> {
    const storage = await this.requestStoragePermission();
    
    return { storage };
  }

  async checkAllPermissions(): Promise<{ storage: boolean }> {
    const storage = await this.checkStoragePermission();
    
    return { storage };
  }
}

export const permissionHandler = PermissionHandler.getInstance();
