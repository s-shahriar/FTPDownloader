import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../constants';

export interface ApiError {
  type: 'network' | 'cors' | 'timeout' | 'server' | 'unknown';
  message: string;
  endpoint?: string;
  statusCode?: number;
  details?: string;
  debugInfo?: string; // Raw error details for debugging
}

interface ErrorModalProps {
  visible: boolean;
  error: ApiError | null;
  onClose: () => void;
}

export function ErrorModal({ visible, error, onClose }: ErrorModalProps) {
  const scale = useRef(new Animated.Value(0.95)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 12,
          velocity: 2,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 0.95,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!error) return null;

  const getErrorIcon = () => {
    switch (error.type) {
      case 'network':
        return 'wifi-off';
      case 'cors':
        return 'block';
      case 'timeout':
        return 'schedule';
      case 'server':
        return 'dns';
      default:
        return 'error-outline';
    }
  };

  const getErrorColor = () => {
    switch (error.type) {
      case 'network':
        return '#ff6b6b';
      case 'cors':
        return '#ffa726';
      case 'timeout':
        return '#ffca28';
      case 'server':
        return '#ef5350';
      default:
        return '#e53935';
    }
  };

  const getErrorTitle = () => {
    switch (error.type) {
      case 'network':
        return 'Network Error';
      case 'cors':
        return 'CORS Policy Error';
      case 'timeout':
        return 'Request Timeout';
      case 'server':
        return 'Server Error';
      default:
        return 'Error';
    }
  };

  const errorColor = getErrorColor();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      <View style={styles.container}>
        <Animated.View
          style={[
            styles.modal,
            {
              transform: [{ scale }],
            },
          ]}
        >
          {/* Header with icon */}
          <View style={[styles.header, { backgroundColor: errorColor + '15' }]}>
            <View style={[styles.iconCircle, { backgroundColor: errorColor + '20' }]}>
              <MaterialIcons name={getErrorIcon()} size={32} color={errorColor} />
            </View>
            <Text style={styles.title}>{getErrorTitle()}</Text>
          </View>

          {/* Error details */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Main message */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ERROR MESSAGE</Text>
              <Text style={styles.errorMessage}>{error.message}</Text>
            </View>

            {/* Endpoint */}
            {error.endpoint && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ENDPOINT</Text>
                <View style={styles.codeBlock}>
                  <Text style={styles.codeText} selectable>
                    {error.endpoint}
                  </Text>
                </View>
              </View>
            )}

            {/* Status code */}
            {error.statusCode && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>STATUS CODE</Text>
                <View style={[styles.badge, { backgroundColor: errorColor + '15' }]}>
                  <Text style={[styles.badgeText, { color: errorColor }]}>
                    {error.statusCode}
                  </Text>
                </View>
              </View>
            )}

            {/* Additional details */}
            {error.details && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>DETAILS</Text>
                <Text style={styles.detailsText}>{error.details}</Text>
              </View>
            )}

            {/* Debug info */}
            {error.debugInfo && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>DEBUG INFO</Text>
                <View style={styles.codeBlock}>
                  <Text style={styles.debugText} selectable>
                    {error.debugInfo}
                  </Text>
                </View>
              </View>
            )}

            {/* Troubleshooting tips */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>TROUBLESHOOTING</Text>
              <View style={styles.tipsList}>
                {error.type === 'network' && (
                  <>
                    <TipItem icon="wifi" text="Check your internet connection" />
                    <TipItem icon="router" text="Verify you're on the correct network" />
                    <TipItem icon="dns" text="Ensure the server is online" />
                  </>
                )}
                {error.type === 'cors' && (
                  <>
                    <TipItem icon="security" text="CORS policy blocking the request" />
                    <TipItem icon="web" text="Try using the proxy server" />
                    <TipItem icon="settings" text="Contact server administrator" />
                  </>
                )}
                {error.type === 'timeout' && (
                  <>
                    <TipItem icon="schedule" text="Server took too long to respond" />
                    <TipItem icon="network-check" text="Check network stability" />
                    <TipItem icon="refresh" text="Try again in a moment" />
                  </>
                )}
                {error.type === 'server' && (
                  <>
                    <TipItem icon="dns" text="Server may be down or unreachable" />
                    <TipItem icon="error-outline" text="Check server status" />
                    <TipItem icon="schedule" text="Try again later" />
                  </>
                )}
                {error.type === 'unknown' && (
                  <>
                    <TipItem icon="help-outline" text="An unexpected error occurred" />
                    <TipItem icon="refresh" text="Try refreshing the page" />
                    <TipItem icon="bug-report" text="Report if issue persists" />
                  </>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: errorColor }]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function TipItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.tipItem}>
      <MaterialIcons name={icon as any} size={16} color={COLORS.textDim} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' as any,
      },
      android: { elevation: 24 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
    }),
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: COLORS.textDim,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    fontWeight: '500',
  },
  codeBlock: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  codeText: {
    fontSize: 12,
    color: COLORS.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  debugText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  detailsText: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  tipsList: {
    gap: 10,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  actions: {
    padding: 20,
    paddingTop: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)' as any,
      },
      android: { elevation: 4 },
    }),
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
