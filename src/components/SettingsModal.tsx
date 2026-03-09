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
  KeyboardAvoidingView,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { MaterialIcons } from '@expo/vector-icons';
import { downloadManager } from '../services/DownloadManager';
import { showAlert } from './AlertModal';
import { COLORS } from '../constants';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const [downloadPath, setDownloadPath] = useState('');
  const [defaultPath, setDefaultPath] = useState('');

  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      const current = downloadManager.getDefaultDownloadPath();
      setDownloadPath(current);
      setDefaultPath(FileSystem.documentDirectory || '');

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
    showAlert('Saved', 'Download location updated. New downloads will use this path.');
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
      // Use StorageAccessFramework to let user pick a directory
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        setDownloadPath(permissions.directoryUri);
      }
    } catch (error) {
      console.error('Directory picker error:', error);
      showAlert('Error', 'Failed to open directory picker.');
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
              </View>

              <Text style={styles.hint}>
                Set the default directory where downloaded files are saved.
                {Platform.OS === 'android'
                  ? ' Use the picker to grant access to external storage or SD card.'
                  : ''}
              </Text>

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

              {/* Action buttons */}
              <View style={styles.buttonRow}>
                {Platform.OS === 'android' && (
                  <TouchableOpacity
                    style={styles.pickerBtn}
                    onPress={handlePickDirectory}
                  >
                    <MaterialIcons name="sd-storage" size={16} color={COLORS.primary} />
                    <Text style={styles.pickerBtnText}>Pick Directory</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
                  <MaterialIcons name="restore" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.resetBtnText}>Reset</Text>
                </TouchableOpacity>
              </View>

              {/* Default path info */}
              <View style={styles.defaultInfo}>
                <MaterialIcons name="info-outline" size={12} color={COLORS.textDim} />
                <Text style={styles.defaultInfoText}>
                  Default: {defaultPath || 'App Documents'}
                </Text>
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
