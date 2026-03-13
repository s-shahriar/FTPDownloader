import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  TextInput,
  Animated,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { MaterialIcons } from '@expo/vector-icons';
import { downloadManager } from '../services/DownloadManager';
import { safPermissionService } from '../services/SAFPermissionService';
import { useApp } from '../contexts/AppContext';
import { showAlert } from './AlertModal';
import { showToast } from './Toast';
import { getGeminiApiKey, setGeminiApiKey } from '../services/GeminiService';
import { COLORS } from '../constants';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const [downloadPath, setDownloadPath] = useState('');
  const [defaultPath, setDefaultPath] = useState('');
  const [safFolderName, setSAFFolderName] = useState('');
  const [isSAFConfigured, setIsSAFConfigured] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const { dispatch } = useApp();

  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      const current = downloadManager.getDefaultDownloadPath();
      setDownloadPath(current);
      setDefaultPath(FileSystem.documentDirectory || '');

      getGeminiApiKey().then(setApiKey);

      // Load SAF configuration
      const safConfigured = safPermissionService.isSAFConfigured();
      setIsSAFConfigured(safConfigured);
      if (safConfigured) {
        setSAFFolderName(safPermissionService.getFolderDisplayName());
      } else {
        setSAFFolderName('Not configured');
      }

      // Animate in
      slideAnim.setValue(300);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const handleSave = async () => {
    const trimmed = downloadPath.trim();
    if (!trimmed) {
      showAlert('Invalid Path', 'Please enter a valid download path.');
      return;
    }
    await downloadManager.setDefaultDownloadPath(trimmed);
    await setGeminiApiKey(apiKey);
    showAlert('Saved', 'Download location and API key updated.');
    handleClose();
  };

  const handleReset = async () => {
    await downloadManager.setDefaultDownloadPath(null);
    setDownloadPath(defaultPath);
    showAlert('Reset', 'Download location reset to default.');
  };

  const handlePickDirectory = async () => {
    if (Platform.OS !== 'android') {
      showAlert(
        'Not Supported',
        'Directory picker is only available on Android. You can manually enter the path below.'
      );
      return;
    }

    try {
      // Release old permission if exists
      if (isSAFConfigured) {
        await safPermissionService.releaseCurrentPermission();
        console.log('✓ Released old SAF permission');
      }

      // Request new folder access
      const result = await safPermissionService.requestFolderAccess();

      if (result.granted && result.uri) {
        // Update UI
        setIsSAFConfigured(true);
        setSAFFolderName(safPermissionService.getFolderDisplayName());
        setDownloadPath(result.uri);

        // Update context
        dispatch({ type: 'SET_SAF_FOLDER_CONFIGURED', payload: true });

        showToast('✓ Folder configured successfully');
      } else {
        showAlert('Permission Denied', result.error || 'Please select a folder to save downloads.');
      }
    } catch (error: any) {
      console.error('Directory picker error:', error);
      showAlert('Error', error.message || 'Failed to open directory picker.');
    }
  };

  const handleTestAccess = async () => {
    if (Platform.OS !== 'android' || !isSAFConfigured) return;

    try {
      const isValid = await safPermissionService.validatePersistedPermission();
      if (isValid) {
        showToast('✓ Folder access is valid');
      } else {
        showAlert(
          'Access Lost',
          'Folder access is no longer valid. Please select a new folder.',
          [{ text: 'OK', onPress: () => setIsSAFConfigured(false) }]
        );
      }
    } catch (error: any) {
      showAlert('Test Failed', error.message || 'Failed to test folder access');
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Handle bar */}
          <View style={styles.handleBar} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>SETTINGS</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                <MaterialIcons name="close" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Download Location Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="folder" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Download Location</Text>
                {Platform.OS === 'android' && isSAFConfigured && (
                  <View style={styles.statusBadge}>
                    <MaterialIcons name="check-circle" size={12} color={COLORS.success} />
                    <Text style={styles.statusBadgeText}>Configured</Text>
                  </View>
                )}
              </View>

              <Text style={styles.hint}>
                {Platform.OS === 'android'
                  ? 'Choose where downloads are saved. This permission persists across app restarts.'
                  : 'Set the default directory where downloaded files are saved.'}
              </Text>

              {/* SAF Folder Display (Android) */}
              {Platform.OS === 'android' ? (
                <View style={styles.safFolderDisplay}>
                  <View style={styles.safFolderInfo}>
                    <Text style={styles.folderLabel}>Current Folder:</Text>
                    <Text style={styles.folderPath} numberOfLines={2}>
                      {safFolderName}
                    </Text>
                  </View>
                  <View style={styles.folderActions}>
                    <TouchableOpacity
                      style={styles.testBtn}
                      onPress={handleTestAccess}
                      disabled={!isSAFConfigured}
                    >
                      <MaterialIcons
                        name="verified"
                        size={14}
                        color={isSAFConfigured ? COLORS.success : COLORS.textDim}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.pathInput}>
                  <TextInput
                    style={styles.pathTextInput}
                    value={downloadPath}
                    onChangeText={setDownloadPath}
                    placeholder="Enter download path…"
                    placeholderTextColor={COLORS.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              )}

              {/* Action buttons */}
              <View style={styles.buttonRow}>
                {Platform.OS === 'android' && (
                  <TouchableOpacity
                    style={styles.pickerBtn}
                    onPress={handlePickDirectory}
                  >
                    <MaterialIcons name="sd-storage" size={16} color={COLORS.primary} />
                    <Text style={styles.pickerBtnText}>
                      {isSAFConfigured ? 'Change Folder' : 'Choose Folder'}
                    </Text>
                  </TouchableOpacity>
                )}

                {Platform.OS !== 'android' && (
                  <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
                    <MaterialIcons name="restore" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.resetBtnText}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Info */}
              {Platform.OS === 'android' ? (
                <View style={styles.defaultInfo}>
                  <MaterialIcons name="info-outline" size={12} color={COLORS.textDim} />
                  <Text style={styles.defaultInfoText}>
                    {isSAFConfigured
                      ? 'Files will be saved to the selected folder'
                      : 'Not configured - files will be saved to Pictures/FTPDownloader'}
                  </Text>
                </View>
              ) : (
                <View style={styles.defaultInfo}>
                  <MaterialIcons name="info-outline" size={12} color={COLORS.textDim} />
                  <Text style={styles.defaultInfoText}>
                    Default: {defaultPath || 'App Documents'}
                  </Text>
                </View>
              )}
            </View>

            {/* AI Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="vpn-key" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>API KEY</Text>
              </View>

              <Text style={styles.hint}>
                Paste your Gemini API key used by AI suggestions.
              </Text>

              <View style={styles.pathInput}>
                <TextInput
                  style={styles.pathTextInput}
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder="Enter Gemini API key…"
                  placeholderTextColor={COLORS.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

          {/* Save button */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <MaterialIcons name="check" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>Save Settings</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '80%',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textDim,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
    opacity: 0.4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.2,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,200,160,0.1)',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  pathInput: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  pathTextInput: {
    paddingVertical: 14,
    fontSize: 12,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
    }),
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(61,127,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(61,127,255,0.2)',
  },
  pickerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  defaultInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  defaultInfoText: {
    fontSize: 10,
    color: COLORS.textDim,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  safFolderDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 12,
  },
  safFolderInfo: {
    flex: 1,
  },
  folderLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  folderPath: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  folderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  testBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(61,127,255,0.35)' as any,
      },
      android: { elevation: 4 },
    }),
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
