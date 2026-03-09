import React, { useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/contexts/AppContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { SearchResultsScreen } from './src/screens/SearchResultsScreen';
import { DownloadsScreen } from './src/screens/DownloadsScreen';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { COLORS } from './src/constants';
import { ToastHost } from './src/components/Toast';
import { AlertHost } from './src/components/AlertModal';
import { DownloadNotificationBar } from './src/components/DownloadNotificationBar';
import { CustomSplashScreen } from './src/components/CustomSplashScreen';

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

  if (isLoading) {
    return <LoadingScreen />;
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
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
