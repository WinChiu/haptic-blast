# Haptic Blast

## Install

```bash
npm install
```

## Start commands

| Command | Platform | Device | When to use |
|---|---|---|---|
| `npx expo start --go --lan` | Windows / macOS | iOS / Android | Expo Go, phone and computer on the same Wi-Fi |
| `npm run test:go` | Windows / macOS | iOS / Android | Expo Go, phone and computer on different networks |
| `npx expo run:android` | Windows / macOS | Android | Dev build via USB (requires Android Studio) |
| `npx expo run:ios --device` | macOS | iOS | Dev build via USB (requires Xcode) |
| `eas build --profile development --platform ios` | Windows / macOS | iOS | Dev build via Expo cloud (requires a paid Apple Developer account) |
