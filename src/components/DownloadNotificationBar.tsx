import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { NavigationContainerRef } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { downloadManager } from '../services/DownloadManager';
import { DOWNLOAD_STATUS, COLORS } from '../constants';

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '';
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

interface Props {
  navigationRef: React.RefObject<NavigationContainerRef<any> | null>;
}

export function DownloadNotificationBar({ navigationRef }: Props) {
  const [state, setState] = useState({
    active: 0,
    progress: 0,
    speed: 0,
  });
  const [currentRoute, setCurrentRoute] = useState('');
  const slideAnim = useRef(new Animated.Value(80)).current;
  const prevActive = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      // Check current route via ref
      const nav = navigationRef.current;
      if (nav) {
        const route = nav.getCurrentRoute();
        setCurrentRoute(route?.name || '');
      }

      const downloads = downloadManager.getAllDownloads();
      const active = downloads.filter(
        d => d.status === DOWNLOAD_STATUS.DOWNLOADING
      );

      if (active.length === 0) {
        if (prevActive.current > 0) {
          Animated.timing(slideAnim, {
            toValue: 80,
            duration: 250,
            useNativeDriver: true,
          }).start();
        }
        prevActive.current = 0;
        setState(prev =>
          prev.active === 0 ? prev : { active: 0, progress: 0, speed: 0 }
        );
        return;
      }

      const totalProgress =
        active.reduce((sum, d) => sum + d.progress, 0) / active.length;
      const totalSpeed = active.reduce((sum, d) => sum + d.speed, 0);

      if (prevActive.current === 0) {
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }).start();
      }
      prevActive.current = active.length;

      setState({
        active: active.length,
        progress: Math.round(totalProgress),
        speed: totalSpeed,
      });
    }, 800);

    return () => clearInterval(interval);
  }, [slideAnim, navigationRef]);

  // Don't render on Downloads screen or when no active downloads
  if (state.active === 0 || currentRoute === 'Downloads') return null;

  const speedStr = formatSpeed(state.speed);

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
    >
      <TouchableOpacity
        style={styles.bar}
        activeOpacity={0.85}
        onPress={() => {
          navigationRef.current?.navigate('Downloads' as never);
        }}
      >
        {/* Progress background fill */}
        <View
          style={[styles.progressFill, { width: `${state.progress}%` }]}
        />

        <View style={styles.content}>
          <View style={styles.iconPulse}>
            <MaterialIcons name="downloading" size={18} color="#fff" />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              Downloading {state.active} file{state.active > 1 ? 's' : ''}
            </Text>
            <Text style={styles.subtitle}>
              {state.progress}%{speedStr ? ` \u00B7 ${speedStr}` : ''}
            </Text>
          </View>

          <View style={styles.chevron}>
            <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.6)" />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 34 : 16,
    left: 16,
    right: 16,
    zIndex: 999,
  },
  bar: {
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(61,127,255,0.4)' as any,
      },
      android: { elevation: 8 },
    }),
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  iconPulse: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  chevron: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
