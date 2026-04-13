# Building APK for Android

This guide provides step-by-step instructions to build and deploy the Visual Novel Engine as an Android APK.

## Prerequisites

Before building, ensure you have:

- **Expo Account:** Create a free account at [expo.dev](https://expo.dev)
- **Node.js 18+:** Download from [nodejs.org](https://nodejs.org)
- **Expo CLI:** Install with `npm install -g expo-cli`
- **Android Device or Emulator:** For testing the APK
- **Sufficient Disk Space:** At least 2GB for build artifacts

## Option 1: Build with EAS (Recommended)

EAS (Expo Application Services) is the official Expo build service and handles all compilation complexity.

### Step 1: Install EAS CLI

```bash
npm install -g eas-cli
```

### Step 2: Authenticate with Expo

```bash
eas login
```

Enter your Expo account credentials. This associates the build with your account.

### Step 3: Configure EAS Project

```bash
eas build:configure
```

This creates an `eas.json` file with build settings. Accept the defaults for Android.

### Step 4: Build for Android

```bash
eas build --platform android
```

The build process will:

1. Upload your project to Expo's servers
2. Compile the React Native code to native Android code
3. Generate a signed APK
4. Return a download link when complete

The build typically takes 5-15 minutes. You'll see progress updates in the terminal.

### Step 5: Download the APK

Once the build completes, you'll receive a download link. Click it or copy the link to download the APK file.

## Option 2: Local Build (Advanced)

For offline builds or custom configurations, you can build locally using Gradle.

### Step 1: Prepare the Project

```bash
cd visual-novel-engine
pnpm install
```

### Step 2: Generate Native Android Project

```bash
expo prebuild --clean
```

This generates the `android/` directory with native code.

### Step 3: Build the APK

```bash
cd android
./gradlew assembleRelease
```

The APK will be generated at:

```
android/app/build/outputs/apk/release/app-release.apk
```

### Step 4: Sign the APK (Optional)

For production releases, sign the APK with a keystore:

```bash
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
  -keystore my-release-key.jks \
  app-release-unsigned.apk alias_name
```

## Installing the APK

### On Android Device

1. **Transfer the APK to your device:**
   - Connect via USB
   - Use `adb push app-release.apk /sdcard/Download/`
   - Or email the APK to yourself and download on the device

2. **Enable Unknown Sources:**
   - Open Settings → Security
   - Enable "Unknown Sources" or "Install unknown apps"
   - Select "Files" or your file manager

3. **Install the APK:**
   - Open Files app
   - Navigate to Downloads
   - Tap the APK file
   - Tap "Install"
   - Grant permissions when prompted

4. **Launch the App:**
   - The app will appear in your app drawer
   - Tap to launch

### On Android Emulator

```bash
adb install app-release.apk
```

The app will install and appear in the emulator's app drawer.

## Troubleshooting Build Issues

### Build Fails with "Gradle Error"

**Solution:** Clear Gradle cache and rebuild:

```bash
cd android
./gradlew clean
cd ..
expo prebuild --clean
cd android
./gradlew assembleRelease
```

### "Keystore Not Found" Error

**Solution:** For local builds, create a new keystore:

```bash
keytool -genkey -v -keystore my-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-key-alias
```

### Build Takes Too Long

**Solution:** EAS builds can take 10-20 minutes. Check build status:

```bash
eas build:list
```

### APK Installation Fails

**Solution:** Ensure the device has sufficient storage. Clear cache:

```bash
adb shell pm clear com.space.manus.visual.novel.engine
```

## Customizing the Build

### Change App Name

Edit `app.config.ts`:

```typescript
const env = {
  appName: "Your Custom Name",
  appSlug: "your-app-slug",
};
```

### Change App Icon

Replace `assets/images/icon.png` with your custom icon (512x512 PNG).

### Change Splash Screen

Replace `assets/images/splash-icon.png` with your custom splash (200x200 PNG).

### Change Package Name

Edit `app.config.ts`:

```typescript
const bundleId = "com.yourcompany.yourapp";
```

## Distribution

### Google Play Store

1. Create a Google Play Developer account ($25 one-time fee)
2. Create a new app in Play Console
3. Upload the signed APK
4. Fill in app details, screenshots, and description
5. Submit for review (typically 2-4 hours)

### Direct Distribution

1. Host the APK on your website or cloud storage
2. Share the download link with users
3. Users download and install manually

### Beta Testing

Use Google Play's beta testing feature:

1. Upload APK to Play Console
2. Create a beta release
3. Share the beta link with testers
4. Collect feedback before production release

## Monitoring Builds

### Check Build Status

```bash
eas build:list --platform android
```

### View Build Logs

```bash
eas build:view <build-id>
```

### Cancel a Build

```bash
eas build:cancel <build-id>
```

## Performance Optimization

For production builds, the app includes:

- **Code minification:** Reduces APK size by ~30%
- **Asset optimization:** Images are compressed
- **Tree shaking:** Unused code is removed
- **Proguard:** Obfuscates Java code

These optimizations happen automatically during the build process.

## APK Size

The typical APK size is 40-60 MB, depending on included assets. To reduce size:

1. Compress background images to under 500KB each
2. Use MP3 audio (not WAV)
3. Remove unused fonts and libraries
4. Enable code splitting in Expo configuration

## Signing & Security

### Automatic Signing (EAS)

EAS automatically signs APKs with a secure key stored on Expo's servers. No action needed.

### Manual Signing (Local Build)

For local builds, create a keystore and sign manually:

```bash
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA256 \
  -keystore my-release-key.jks \
  app-release-unsigned.apk my-key-alias
```

**Important:** Keep your keystore file safe. Losing it means you can't update your app.

## Next Steps

After building the APK:

1. **Test thoroughly** on various Android devices and versions
2. **Gather user feedback** from beta testers
3. **Monitor crash reports** using Firebase Crashlytics (optional)
4. **Plan updates** for new features and bug fixes

## Support

For build issues or questions:

- Check [Expo documentation](https://docs.expo.dev)
- Review [Android build troubleshooting](https://docs.expo.dev/build/troubleshooting)
- Visit [Expo forums](https://forums.expo.dev)

---

**Last Updated:** March 2026
