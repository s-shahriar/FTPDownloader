# FTPDownloader - Media Downloader

A professional React Native Expo app for browsing and downloading media from FTP servers.

## Features

- **Browse FTP Servers**: Access multiple media servers
- **Category-Based Search**: Search by category (Movies, TV Series, Animation, etc.)
- **Download Manager**: Full-featured download manager with:
  - Pause/Resume support
  - Progress tracking
  - Multiple concurrent downloads
  - Download history
  - Retry failed downloads
- **Professional UI**: Clean, modern Material Design-inspired interface
- **Storage Permissions**: Automatic permission handling for Android

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a local environment file for AI search:
   ```bash
   cp .env.example .env
   ```
   Then set `EXPO_PUBLIC_GEMINI_API_KEY` in `.env`.

3. Install EAS CLI (for building APKs):
   ```bash
   npm install -g eas-cli
   ```

4. Start the development server:
   ```bash
   npm start
   ```

## Running the App

### Development

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run dev:android` | Run on connected Android device with hot reload |
| `npm run android` | Start via Expo Go on Android |
| `npm run web` | Start web version |
| `npm run web:full` | Start web version with CORS proxy |

### Building APK (Local)

| Command | Description |
|---------|-------------|
| `npm run build:android` | Build APK for **arm64 only** (faster build, smaller APK) |
| `npm run build:android:all` | Build APK for **all architectures** (universal) |
| `npm run build:android:x86` | Build APK for **x86_64 only** (emulator) |

### Building APK (Cloud)

| Command | Description |
|---------|-------------|
| `npm run build:android:cloud` | Build APK on EAS servers (no local resources needed) |

### Build Optimizations

The build is configured with the following optimizations in [eas.json](eas.json):
- **arm64-v8a only** (default profile) — smaller APK, faster build
- **Parallel Gradle execution** — uses multiple workers to speed up builds
- **Max 4 Gradle workers** — prevents system from hanging during builds

## Usage

1. **First Launch**: The app will request storage permissions. Grant permissions to enable downloads.

2. **Search for Media**:
   - Select a category from the dropdown
   - Enter the movie/series name in the search bar
   - Tap the search button or press Enter

3. **Browse Results**:
   - Tap on folders to navigate deeper
   - Tap the download icon on video files to start downloading

4. **Manage Downloads**:
   - View all downloads in the Downloads screen
   - Pause/Resume/Cancel active downloads
   - Retry failed downloads
   - Delete completed downloads

## Project Structure

```
FTPDownloader/
├── App.tsx                     # Main app entry point
├── src/
│   ├── components/             # Reusable UI components
│   │   ├── SearchBar.tsx
│   │   ├── CategoryDropdown.tsx
│   │   ├── DownloadItemCard.tsx
│   │   └── ResultItem.tsx
│   ├── screens/                # Screen components
│   │   ├── HomeScreen.tsx
│   │   ├── SearchResultsScreen.tsx
│   │   └── DownloadsScreen.tsx
│   ├── services/               # Business logic
│   │   ├── FTPClient.ts
│   │   └── DownloadManager.ts
│   ├── contexts/               # React Context
│   │   └── AppContext.tsx
│   ├── constants/              # App constants
│   │   └── index.ts
│   ├── types/                  # TypeScript types
│   │   └── index.ts
│   └── utils/                  # Utility functions
│       └── permissions.ts
└── assets/                     # Images and icons
```

## Technical Details

### FTP Server Structure

The app is designed to work with h5ai-powered FTP servers with the following structure:

**Movies (Year-Based)**:
```
/Category/(Year)/Movie Name (Year) Quality [Audio]/
```

**TV Series (Alphabetical)**:
```
/Category/TV Series A-L/Series Name (Year) Quality/
```

**Foreign Language (Language-Based)**:
```
/Foreign Language Movies/Language/Movie Name (Year) Quality/
```

### Download Manager Features

- **Pause/Resume**: Uses Expo FileSystem's download resumable API
- **Progress Tracking**: Real-time progress updates with percentage and bytes
- **Concurrent Downloads**: Support for multiple simultaneous downloads
- **Persistent Storage**: Download history saved in AsyncStorage
- **Error Handling**: Automatic retry for failed downloads

## Requirements

- Node.js 16+
- npm or yarn
- Expo CLI
- Android Studio (for Android development)
- Android 16+ (for optimal performance)

## Permissions

The app requires the following permissions:

- **INTERNET**: Access FTP servers
- **READ_EXTERNAL_STORAGE**: Read downloaded files
- **WRITE_EXTERNAL_STORAGE**: Save downloaded files
- **ACCESS_NETWORK_STATE**: Check network connectivity

## Troubleshooting

### Storage Permission Issues

If you encounter storage permission issues:
1. Go to Settings > Apps > FTPDownloader
2. Tap Permissions
3. Grant Storage permission

### Download Failures

- Check your network connection
- Ensure you have sufficient storage space
- Try pausing and resuming the download
- Restart the app and retry

## Contributing

Feel free to submit issues and pull requests.

## License

MIT License

## Credits

- Expo Framework
- React Native
- Material Design Icons
