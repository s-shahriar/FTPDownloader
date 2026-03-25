# FTPDownloader — Project Instructions

## GitHub Release Rules

When the user asks to publish/release an APK to GitHub:

### 1. Find the last release tag
```bash
gh release list -R s-shahriar/FTPDownloader --limit 1 --json tagName --jq '.[0].tagName'
```

### 2. Determine the next version
- Increment the **patch** version for bug fixes / minor changes (e.g. v1.1.1 → v1.1.2)
- Increment the **minor** version for new features (e.g. v1.1.1 → v1.2.0)
- Increment the **major** version for breaking changes (e.g. v1.1.1 → v2.0.0)
- Ask the user which bump is appropriate if unclear

### 3. Update version numbers in project files
**CRITICAL**: Before building, update the version in all these files to match the new version (e.g., for v1.4.0):

**package.json:**
```json
{
  "version": "1.4.0"
}
```

**app.json:**
```json
{
  "expo": {
    "version": "1.4.0",
    "android": {
      "versionCode": 4
    }
  }
}
```
Note: versionCode should increment by 1 with each release (e.g., v1.3.0=3, v1.4.0=4, v1.5.0=5)

**android/app/build.gradle:**
```gradle
defaultConfig {
    versionCode 4
    versionName "1.4.0"
}
```

Use the Edit tool to update each file with the new version numbers.

### 4. APK filename convention
Always name the APK asset: `FTP-Downloader-vX.Y.Z.apk`
- Use hyphens, not underscores
- Always include the `v` prefix in the version

### 5. Release title convention
`FTP Downloader vX.Y.Z - <Short Description>`

Examples:
- `FTP Downloader v1.2.0 - AI-Powered Search`
- `FTP Downloader v1.1.1 - Icon & Splash Fixes`

### 6. Build the APK
```bash
npm run build:android
```
The built APK will be in `android/app/build/outputs/apk/release/` or downloaded via EAS. Confirm the exact path after build.

### 7. Rename and prepare the APK
Copy/rename the built APK to follow the naming convention:
```bash
cp <build-output-path> /home/syed/Projects/FTPDownloader/FTP-Downloader-vX.Y.Z.apk
```

### 8. Create the release
```bash
gh release create vX.Y.Z \
  --repo s-shahriar/FTPDownloader \
  --title "FTP Downloader vX.Y.Z - <Description>" \
  --notes "<Release notes>" \
  "path/to/FTP-Downloader-vX.Y.Z.apk#FTP-Downloader-vX.Y.Z.apk"
```

### 9. Verify and install
After creating, confirm all assets and title look correct:
```bash
gh release view vX.Y.Z -R s-shahriar/FTPDownloader
```

Optionally install on ADB device for testing:
```bash
adb install -r /home/syed/Projects/FTPDownloader/FTP-Downloader-vX.Y.Z.apk
```
