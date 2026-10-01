# Haptic Blast

## Install

```bash
npm install
```

## Start commands

| Command | Platform | Device | When to use |
|---|---|---|---|
| `npx expo start --go --lan` | Windows / macOS | iOS / Android | Expo Go, phone and computer on the same Wi-Fi |
| `npm run test:go` | Windows / macOS | iOS / Android | Expo Go, phone and computer on different networks (tunnel) |
| `npx expo start --go --tunnel --clear` | Windows / macOS | iOS / Android | Same as above, with cache cleared |
| `npx expo run:android` | Windows / macOS | Android | Build and install the Android dev build (requires Android Studio + phone connected via USB) |
| `npm test` | Windows / macOS | iOS / Android | Use the installed dev build (tunnel) |
| `eas build --profile development --platform ios` | Windows / macOS | iOS | Build the iOS dev build in the Expo cloud (requires a paid Apple Developer account) |
| `npx expo run:ios --device` | macOS | iOS | Build and install the iOS dev build on an iPhone connected via USB (requires Xcode; a free Apple ID works, but the app expires after 7 days) |
| `npx expo run:ios` | macOS | iOS Simulator | Build and run on the iOS Simulator (no haptics in the Simulator) |
