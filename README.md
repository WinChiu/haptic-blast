# Haptic Blast

## Install

```bash
npm install
```

## Start commands

| Command | Platform | Device | When to use |
|---|---|---|---|
| `npx expo start --go --lan` | Windows / macOS | iOS / Android | Quick test in Expo Go (same Wi-Fi). Haptics are limited: fixed strength on Android, taps on iOS |
| `npm run test:go` | Windows / macOS | iOS / Android | Quick test in Expo Go (different networks). Haptics are limited: fixed strength on Android, taps on iOS |
| `npx expo run:android` | Windows / macOS | Android | All features. Dev build via USB (requires Android Studio and JDK 17) |
| `npx expo run:ios --device` | macOS | iOS | All features. Dev build via USB (requires Xcode) |
| `eas build --profile development --platform ios` | Windows / macOS | iOS | All features. Dev build via Expo cloud (requires a paid Apple Developer account) |

## Android dev build (Windows)

### Setup (once)

1. **Android Studio** → SDK Manager, install:
   - SDK Platforms: **Android 16 (API 36)**
   - SDK Tools: **Android SDK Build-Tools 36**, **Android SDK Platform-Tools**
2. **JDK 17** (not the JDK 25 bundled with Android Studio, which fails the CMake step):
   ```bash
   winget install Microsoft.OpenJDK.17
   ```
3. **Environment variables** (user variables, then open a new terminal):
   - `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`
   - `JAVA_HOME` = the JDK 17 folder, e.g. `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`
   - Add `%LOCALAPPDATA%\Android\Sdk\platform-tools` to `Path` (for `adb`)
4. **Phone**: enable Developer options → **USB debugging**, connect via USB, allow the prompt. `adb devices` should list it as `device`.
5. **Google Maps API key** (`react-native-maps` on Android crashes without one): create `.env.local` in the project root (gitignored, never committed):
   ```
   GOOGLE_MAPS_ANDROID_API_KEY=your-key
   ```
   `app.config.js` injects it at build time. Ask the project owner for the key, or create one in Google Cloud Console with **Maps SDK for Android** enabled.
6. **Project path must be ASCII only** (e.g. `C:\coding-project\haptic-blast`). Node 24 before 24.15 silently fails to copy files into non-ASCII paths, which breaks `expo prebuild`.

### Build

```bash
npm install
npx expo run:android
```

The first build takes 10–20 minutes, then the app installs and opens on the phone. After that, JS changes reload live; rebuild only when native dependencies change.

## iOS dev build (macOS)

### Setup (once)

1. **Xcode** from the App Store. Open it once to accept the license and download the iOS platform.
2. **Xcode command line tools**:
   ```bash
   xcode-select --install
   ```
3. **CocoaPods** (installs native iOS dependencies such as Pulsar):
   ```bash
   brew install cocoapods
   ```
4. **Apple ID**: sign in under Xcode → Settings → Accounts. A free Apple ID works, but apps it signs expire after 7 days.
5. **iPhone**: connect via USB and tap **Trust This Computer**. On iOS 16+, turn on Settings → Privacy & Security → **Developer Mode** (it appears after connecting to Xcode once).
6. **Project path**: keep it ASCII only, same as on Windows.

### Build

```bash
npm install
npx expo run:ios --device
```

Pick your iPhone from the list. The first build takes 10–20 minutes. On first launch, trust the developer certificate under Settings → General → **VPN & Device Management**. If Xcode reports the bundle ID `com.winchiu.hapticblast` is taken, change `ios.bundleIdentifier` in `app.json`.

## Native code (Swift / Kotlin)

React Native's JavaScript can't call iOS or Android APIs directly. It goes through a native module: a thin layer of Swift / Objective-C (iOS) or Kotlin / Java (Android) that calls the platform API and exposes it to JS.

```
JS (e.g. hooks/useBuzz.ts) → native module (Swift / Kotlin) → platform API (Core Haptics, Play services, …)
```

Expo Go only contains the native modules Expo ships with it, so anything that adds its own native code needs a **dev build** (see the start commands above). In Expo Go the app falls back to what's available there.

Native code used by this project:

| Feature | Native module | iOS | Android |
|---|---|---|---|
| Continuous buzz with variable strength | [`react-native-pulsar`](https://docs.swmansion.com/pulsar/sdk/react-native/) | Core Haptics | `VibrationEffect` |
| Compass heading | [`modules/fused-orientation`](modules/fused-orientation) (local Expo module) | — (uses CoreLocation via `expo-location`) | Google Play services Fused Orientation Provider |

To write a new native module, see [Expo Modules API](https://docs.expo.dev/modules/overview/) (`npx create-expo-module --local` creates one under `modules/`).
