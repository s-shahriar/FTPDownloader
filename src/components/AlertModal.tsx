import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../constants';

// ── Types ────────────────────────────────────────────────
interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertConfig {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  iconColor?: string;
}

// ── Singleton emitter ────────────────────────────────────
type AlertListener = (config: AlertConfig) => void;
let _alertListener: AlertListener | null = null;

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: { icon?: AlertConfig['icon']; iconColor?: string }
) {
  _alertListener?.({
    title,
    message,
    buttons: buttons || [{ text: 'OK' }],
    icon: options?.icon,
    iconColor: options?.iconColor,
  });
}

// ── Host Component ───────────────────────────────────────
export function AlertHost() {
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const scale = useRef(new Animated.Value(0.95)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    _alertListener = (cfg) => {
      setConfig(cfg);
      setVisible(true);
      scale.setValue(0.95);
      opacity.setValue(0);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 12,
          velocity: 2,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    };
    return () => { _alertListener = null; };
  }, [scale, opacity, backdropOpacity]);

  const handlePress = (button: AlertButton) => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 0.95,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setConfig(null);
      button.onPress?.();
    });
  };

  const handleBackdrop = () => {
    const cancelBtn = config?.buttons?.find(b => b.style === 'cancel');
    if (cancelBtn) {
      handlePress(cancelBtn);
    }
  };

  if (!visible || !config) return null;

  const getIcon = (): { name: React.ComponentProps<typeof MaterialIcons>['name']; color: string } => {
    if (config.icon) return { name: config.icon, color: config.iconColor || COLORS.primary };

    const titleLower = config.title.toLowerCase();
    if (titleLower.includes('error') || titleLower.includes('fail'))
      return { name: 'error-outline', color: COLORS.error };
    if (titleLower.includes('cancel') || titleLower.includes('delete') || titleLower.includes('clear'))
      return { name: 'warning-amber', color: COLORS.warning };
    if (titleLower.includes('success') || titleLower.includes('saved') || titleLower.includes('reset'))
      return { name: 'check-circle-outline', color: COLORS.success };
    if (titleLower.includes('select') || titleLower.includes('enter') || titleLower.includes('search'))
      return { name: 'info-outline', color: COLORS.primary };
    if (titleLower.includes('no result'))
      return { name: 'search-off', color: COLORS.textSecondary };
    if (titleLower.includes('download'))
      return { name: 'downloading', color: COLORS.primary };
    if (titleLower.includes('permission') || titleLower.includes('storage'))
      return { name: 'security', color: COLORS.warning };
    if (titleLower.includes('not supported'))
      return { name: 'block', color: COLORS.textSecondary };
    return { name: 'info-outline', color: COLORS.primary };
  };

  const icon = getIcon();
  const hasCancel = config.buttons?.some(b => b.style === 'cancel');
  const actionButtons = config.buttons?.filter(b => b.style !== 'cancel') || [];
  const cancelButton = config.buttons?.find(b => b.style === 'cancel');

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleBackdrop}>
      <Animated.View style={[styles.overlayContainer, { opacity: backdropOpacity }]}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={handleBackdrop}
        >
          <Animated.View
            style={[styles.dialog, { transform: [{ scale }], opacity }]}
          >
            <TouchableOpacity activeOpacity={1}>
            {/* Icon */}
            <View style={[styles.iconWrap, { backgroundColor: `${icon.color}12` }]}>
              <MaterialIcons name={icon.name} size={28} color={icon.color} />
            </View>

            {/* Title */}
            <Text style={styles.title}>{config.title}</Text>

            {/* Message */}
            {config.message ? (
              <Text style={styles.message}>{config.message}</Text>
            ) : null}

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              {hasCancel && cancelButton && (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => handlePress(cancelButton)}
                >
                  <Text style={styles.cancelBtnText}>{cancelButton.text}</Text>
                </TouchableOpacity>
              )}
              {actionButtons.map((btn, i) => {
                const isDestructive = btn.style === 'destructive';
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.actionBtn,
                      isDestructive && styles.destructiveBtn,
                      !hasCancel && actionButtons.length === 1 && styles.actionBtnFull,
                    ]}
                    onPress={() => handlePress(btn)}
                  >
                    <Text style={[
                      styles.actionBtnText,
                      isDestructive && styles.destructiveBtnText,
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  dialog: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 16px 48px rgba(0,0,0,0.15)' as any,
      },
      android: { elevation: 12 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
    }),
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(61,127,255,0.3)' as any,
      },
      android: { elevation: 3 },
    }),
  },
  actionBtnFull: {
    flex: 1,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  destructiveBtn: {
    backgroundColor: COLORS.error,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(255,77,106,0.3)' as any,
      },
    }),
  },
  destructiveBtnText: {
    color: '#fff',
  },
});
