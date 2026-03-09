import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../constants';

interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; onPress: () => void };
}

// Singleton event emitter for toast
type Listener = (msg: ToastMessage) => void;
let _listener: Listener | null = null;
let _idCounter = 0;

export function showToast(
  text: string,
  action?: { label: string; onPress: () => void }
) {
  _idCounter++;
  _listener?.({ id: _idCounter, text, action });
}

export function ToastHost() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 20, duration: 200, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  useEffect(() => {
    _listener = (msg) => {
      // If a toast is already showing, reset it
      if (timer.current) clearTimeout(timer.current);

      setToast(msg);
      opacity.setValue(0);
      translateY.setValue(20);

      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();

      timer.current = setTimeout(hide, 4000);
    };

    return () => {
      _listener = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [opacity, translateY, hide]);

  if (!toast) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity, transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <View style={styles.toast}>
        <MaterialIcons name="downloading" size={18} color={COLORS.primary} />
        <Text style={styles.text} numberOfLines={2}>
          {toast.text}
        </Text>
        {toast.action && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              toast.action!.onPress();
              hide();
            }}
          >
            <Text style={styles.actionText}>{toast.action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.text,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: 440,
    width: '100%',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)' as any,
      },
      android: { elevation: 8 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
    }),
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
    lineHeight: 18,
  },
  actionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(61,127,255,0.2)',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
