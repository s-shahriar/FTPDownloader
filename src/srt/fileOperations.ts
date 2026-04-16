import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { StorageAccessFramework } = FileSystem;
const SRT_SAF_DIR_URI_KEY = 'srt_saf_directory_uri';

function getMimeTypeForSubtitle(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'srt') return 'application/x-subrip';
  if (ext === 'ass' || ext === 'ssa') return 'text/x-ssa';
  if (ext === 'vtt') return 'text/vtt';
  return 'text/plain';
}

function isSafUri(uri: string): boolean {
  return uri.startsWith('content://');
}

function isInAppCache(uri: string): boolean {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return false;
  return uri.startsWith(cacheDir);
}

function getParentDirectoryUri(docUri: string): string | null {
  const docIdx = docUri.indexOf('/document/');
  if (docIdx < 0) return null;

  const treeRootUri = docUri.substring(0, docIdx);
  const docIdEncoded = docUri.substring(docIdx + '/document/'.length);
  const docId = decodeURIComponent(docIdEncoded);
  const lastSlash = docId.lastIndexOf('/');

  if (lastSlash < 0) {
    return treeRootUri;
  }

  const parentDocId = docId.substring(0, lastSlash);
  return `${treeRootUri}/document/${encodeURIComponent(parentDocId)}`;
}

export async function readSubtitleFile(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    return resp.text();
  }
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

async function saveToSafDirectory(
  directoryUri: string,
  filename: string,
  content: string
): Promise<void> {
  const fileUri = await StorageAccessFramework.createFileAsync(
    directoryUri,
    filename,
    getMimeTypeForSubtitle(filename)
  );
  await StorageAccessFramework.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

async function getSavedSrtDirectoryUri(): Promise<string | null> {
  if (Platform.OS !== 'android') return FileSystem.documentDirectory;
  try {
    return await AsyncStorage.getItem(SRT_SAF_DIR_URI_KEY);
  } catch {
    return null;
  }
}

async function requestSrtDirectoryAccess(): Promise<string | null> {
  if (Platform.OS !== 'android') return FileSystem.documentDirectory;
  try {
    const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync(null);
    if (permissions.granted) {
      const uri = permissions.directoryUri;
      await AsyncStorage.setItem(SRT_SAF_DIR_URI_KEY, uri);
      return uri;
    }
    return null;
  } catch (err) {
    console.warn('SAF permission request failed:', err);
    return null;
  }
}

/**
 * Save translated subtitle file.
 * 1. If source is SAF URI → save in source file's parent folder
 * 2. Else if source is file:// outside app cache → save in same folder
 * 3. Else use saved SRT SAF directory / prompt for one
 * 4. Fallback: save in app dir + share dialog
 */
export async function saveSubtitleFile(
  filename: string,
  content: string,
  sourceUri?: string
): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  try {
    if (sourceUri && isSafUri(sourceUri)) {
      const sourceParentUri = getParentDirectoryUri(sourceUri);
      if (sourceParentUri) {
        await saveToSafDirectory(sourceParentUri, filename, content);
        Alert.alert('Saved', `File saved:\n${filename}`);
        return;
      }
    }

    if (sourceUri && sourceUri.startsWith('file://') && !isInAppCache(sourceUri)) {
      const lastSlash = sourceUri.lastIndexOf('/');
      if (lastSlash > 0) {
        const directoryUri = sourceUri.substring(0, lastSlash + 1);
        const outputUri = `${directoryUri}${filename}`;
        await FileSystem.writeAsStringAsync(outputUri, content, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        Alert.alert('Saved', `File saved:\n${filename}`);
        return;
      }
    }

    let dirUri = await getSavedSrtDirectoryUri();
    if (!dirUri) {
      dirUri = await requestSrtDirectoryAccess();
    }

    if (dirUri) {
      await saveToSafDirectory(dirUri, filename, content);
      Alert.alert('Saved', `File saved:\n${filename}`);
      return;
    }

    await saveToAppDirAndShare(filename, content);
  } catch (error: any) {
    console.error('Save error:', error);
    try {
      await saveToAppDirAndShare(filename, content);
    } catch (fallbackError: any) {
      Alert.alert('Save Failed', fallbackError.message);
    }
  }
}

async function saveToAppDirAndShare(filename: string, content: string): Promise<void> {
  const documentsDir = FileSystem.documentDirectory;
  if (!documentsDir) throw new Error('Document directory not available');

  const outputUri = `${documentsDir}${filename}`;
  await FileSystem.writeAsStringAsync(outputUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  Alert.alert(
    'File Saved',
    'File saved to app storage. Use "Share" to move it to another location.',
    [
      { text: 'OK', style: 'cancel' },
      {
        text: 'Share',
        onPress: async () => {
          await Sharing.shareAsync(outputUri, {
            mimeType: 'text/plain',
            dialogTitle: `Save ${filename}`,
            UTI: 'public.plain-text',
          });
        },
      },
    ]
  );
}
