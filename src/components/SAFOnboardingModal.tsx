import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { safPermissionService } from '../services/SAFPermissionService';
import { showAlert } from './AlertModal';

interface SAFOnboardingModalProps {
  visible: boolean;
  onComplete: (success: boolean) => void;
  onCancel: () => void;
}

export function SAFOnboardingModal({
  visible,
  onComplete,
  onCancel,
}: SAFOnboardingModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'intro' | 'success'>('intro');

  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (visible) {
      // Reset state
      setStep('intro');
      setIsLoading(false);

      // Animate in
      slideAnim.setValue(300);
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);

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
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
      ]).start();
    }
  }, [visible]);

  const handleChooseFolder = async () => {
    if (Platform.OS !== 'android') {
      showAlert('Not Supported', 'This feature is only available on Android devices.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await safPermissionService.requestFolderAccess();

      if (result.granted) {
        // Show success step
        setStep('success');
        // Auto-close after 1.5 seconds
        setTimeout(() => {
          handleClose(true);
        }, 1500);
      } else {
        setIsLoading(false);
        showAlert(
          'Permission Denied',
          result.error || 'Please select a folder to continue using the app.'
        );
      }
    } catch (error: any) {
      setIsLoading(false);
      showAlert('Error', error.message || 'Failed to request folder access');
    }
  };

  const handleClose = (success: boolean) => {
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
      onComplete(success);
    });
  };

  const handleCancel = () => {
    if (isLoading) return;
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
      onCancel();
    });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleCancel}
          disabled={isLoading}
        />
        <Animated.View
          style={[
            styles.modal,
            {
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
            },
          ]}
        >
          {step === 'intro' ? (
            <>
              {/* Icon */}
              <View style={styles.iconContainer}>
                <MaterialIcons name="folder-open" size={64} color={COLORS.primary} />
              </View>

              {/* Title */}
              <Text style={styles.title}>Choose Download Folder</Text>

              {/* Description */}
              <Text style={styles.description}>
                Select a folder where all your downloads will be saved. This is a one-time
                setup, just like 1DM!
              </Text>

              {/* Benefits */}
              <View style={styles.benefitsContainer}>
                <View style={styles.benefitRow}>
                  <MaterialIcons name="check-circle" size={20} color={COLORS.success} />
                  <Text style={styles.benefitText}>Choose any folder on your device</Text>
                </View>
                <View style={styles.benefitRow}>
                  <MaterialIcons name="check-circle" size={20} color={COLORS.success} />
                  <Text style={styles.benefitText}>Save to SD card or internal storage</Text>
                </View>
                <View style={styles.benefitRow}>
                  <MaterialIcons name="check-circle" size={20} color={COLORS.success} />
                  <Text style={styles.benefitText}>No more permission prompts</Text>
                </View>
              </View>

              {/* Buttons */}
              <TouchableOpacity
                style={[styles.primaryBtn, isLoading && styles.primaryBtnDisabled]}
                onPress={handleChooseFolder}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="sd-storage" size={20} color="#fff" />
                    <Text style={styles.primaryBtnText}>Choose Folder</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleCancel}
                disabled={isLoading}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Success Icon */}
              <View style={styles.successIconContainer}>
                <MaterialIcons name="check-circle" size={80} color={COLORS.success} />
              </View>

              {/* Success Title */}
              <Text style={styles.successTitle}>All Set!</Text>

              {/* Success Description */}
              <Text style={styles.successDescription}>
                Folder configured successfully. Your downloads will be saved to:
              </Text>

              {/* Folder Path */}
              <View style={styles.folderPathContainer}>
                <MaterialIcons name="folder" size={16} color={COLORS.primary} />
                <Text style={styles.folderPathText}>
                  {safPermissionService.getFolderDisplayName()}
                </Text>
              </View>
            </>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...Platform.select({
      android: { elevation: 8 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
    }),
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(61,127,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  benefitsContainer: {
    width: '100%',
    marginBottom: 28,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  benefitText: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 4 },
    }),
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  successIconContainer: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
  },
  successDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  folderPathContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  folderPathText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
});
