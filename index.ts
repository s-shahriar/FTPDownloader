import { registerRootComponent } from 'expo';
import notifee from '@notifee/react-native';

import App from './App';

// Register Notifee foreground service early
notifee.registerForegroundService(() => {
  return new Promise(() => {
    // Promise never resolves - keeps service alive
    // Service lifetime managed by NotificationService
  });
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
