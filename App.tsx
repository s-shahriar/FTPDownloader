import React, { useRef, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import notifee, { EventType } from '@notifee/react-native';
import { AppProvider, useApp } from './src/contexts/AppContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { SearchResultsScreen } from './src/screens/SearchResultsScreen';
import { DownloadsScreen } from './src/screens/DownloadsScreen';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from './src/constants';
import { ToastHost } from './src/components/Toast';
import { AlertHost } from './src/components/AlertModal';
import { DownloadNotificationBar } from './src/components/DownloadNotificationBar';
import { CustomSplashScreen } from './src/components/CustomSplashScreen';
import { downloadManager } from './src/services/DownloadManager';
import { notificationService } from './src/services/NotificationService';

// Prevent native splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();

function PermissionScreen() {
  return (
    <View style={styles.permissionContainer}>
      <Text style={styles.permissionTitle}>Storage Permission Required</Text>
      <Text style={styles.permissionText}>
        This app needs storage permission to download and save files to your device.
      </Text>
    </View>
  );
}

function AppNavigator() {
  const { isLoading, storagePermissionGranted } = useApp();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  // Hide native splash screen when app is ready
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  // Setup Notifee event handlers
  useEffect(() => {
    // Handle notification actions when app is in foreground
    const unsubscribeForeground = notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.PRESS && detail.pressAction?.id === 'open_downloads') {
        // Navigate to downloads screen
        navigationRef.current?.navigate('Downloads');
      }

      if (type === EventType.ACTION_PRESS) {
        await handleNotificationAction(detail.pressAction!.id, detail.notification?.data);
      }
    });

    // Handle notification actions when app is in background
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        await handleNotificationAction(detail.pressAction!.id, detail.notification?.data);
      }
    });

    return () => {
      unsubscribeForeground();
    };
  }, []);

  async function handleNotificationAction(actionId: string, data: any) {
    const downloadId = data?.downloadId;

    // Parse action
    if (actionId.startsWith('pause_')) {
      const id = actionId.replace('pause_', '');
      if (id === 'all') {
        // Pause all downloads
        const downloads = await downloadManager.getAllDownloads();
        for (const download of downloads) {
          if (download.status === 'downloading') {
            await downloadManager.pauseDownload(download.id);
          }
        }
      } else {
        await downloadManager.pauseDownload(id);
      }
    } else if (actionId.startsWith('resume_')) {
      const id = actionId.replace('resume_', '');
      if (id === 'all') {
        // Resume all paused downloads
        const downloads = await downloadManager.getAllDownloads();
        for (const download of downloads) {
          if (download.status === 'paused') {
            await downloadManager.resumeDownload(download.id);
          }
        }
      } else {
        await downloadManager.resumeDownload(id);
      }
    } else if (actionId.startsWith('cancel_')) {
      const id = actionId.replace('cancel_', '');
      await downloadManager.cancelDownload(id);
    } else if (actionId.startsWith('retry_')) {
      const id = actionId.replace('retry_', '');
      await downloadManager.resumeDownload(id); // Resume is same as retry for paused downloads
    } else if (actionId.startsWith('clear_')) {
      const id = actionId.replace('clear_', '');
      await notificationService.dismissDownloadNotification(id);
    }
  }

  if (isLoading) {
    return <CustomSplashScreen />;
  }

  if (!storagePermissionGranted) {
    return <PermissionScreen />;
  }

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="SearchResults" component={SearchResultsScreen} />
          <Stack.Screen name="Downloads" component={DownloadsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <DownloadNotificationBar navigationRef={navigationRef} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <AppNavigator />
        <ToastHost />
        <AlertHost />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 32,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
