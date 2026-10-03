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

## Route planning

Pressing **Preview Route** asks a routing server for a walking route, turns it into a short list of checkpoints, and draws it on the map. The haptic guidance then points at the next checkpoint.

```
HomeScreen → util/routing.ts (fetchRoute) → GraphHopper server
          → components/Map.tsx → util/checkpoints.ts (generateCheckpoints) → checkpoints
```

| Part | File | What it does |
|---|---|---|
| Fetch a route | [`util/routing.ts`](util/routing.ts) | Calls `GET /route?point=lat,lng&point=lat,lng&profile=foot&points_encoded=false` and converts GraphHopper's `[lng, lat]` pairs into `{ latitude, longitude }`. Throws a readable error on timeout, bad status or an empty route. |
| Generate checkpoints | [`util/checkpoints.ts`](util/checkpoints.ts) | Turns the dense route (~130 points for 3 km) into checkpoints at every real turn, plus extra ones so no straight stretch has a gap over `maxSpacing`. |
| Geometry helpers | [`util/geo.ts`](util/geo.ts) | Distance, bearing and distance-to-segment in metres. |
| Settings | [`util/globals.ts`](util/globals.ts) → `CHECKPOINTS` | `simplifyTolerance` 8 m, `maxSpacing` 50 m, `minSpacing` 15 m. |
| Server address | [`util/config.ts`](util/config.ts) | `MAP_SERVER_URL`, the address of the routing server. |
| Choose a destination | [`components/Map.tsx`](components/Map.tsx), [`screens/HomeScreen.tsx`](screens/HomeScreen.tsx) | Long-press the map to drop a red pin. **Preview Route** stays disabled until a pin is set, then routes from the current position (or the debug position) to the pin. The pin can't be moved while a route is previewed or navigating. |

### How checkpoints are generated

1. **Simplify** the route with the Douglas-Peucker algorithm. A point is kept only if removing it would move the line by more than `simplifyTolerance` metres, so what is left are the real turns.
2. **Thin out** points closer than `minSpacing` to the previous one. The first and last points are always kept.
3. **Fill** long straight stretches with evenly spaced points so no gap exceeds `maxSpacing`.

The full route is still drawn as the blue line; only the checkpoints are used for guidance.

### When a checkpoint counts as reached

A checkpoint is reached when either:

1. the user is within `CHECKPOINT_THRESHOLD` (4 m) of it, or
2. the user is within `CHECKPOINT_PASS_RADIUS` (12 m) of it **and has already gone past it** towards the next checkpoint (`alongTrackMeters` in `util/geo.ts` is positive).

Rule 2 exists because of GPS drift: walking past a checkpoint 6 m to the side never enters the 4 m circle, so the buzz would keep pointing back at it. The logic is in the "Calculate Next Checkpoint" effect in `components/Map.tsx`.

Known limit: if the user is more than 12 m away when passing (for example cutting a corner), the checkpoint is not skipped and the guidance points back at it until they get within 12 m.

On a real 3.1 km route this gives 134 server points → 78 checkpoints. The count is mainly set by `maxSpacing` (3100 m ÷ 50 m is at least 62), so use a larger value for fewer checkpoints:

| `maxSpacing` | Checkpoints (3.1 km route) |
|---|---|
| 25 m | 152 |
| 50 m | 78 |
| 100 m | 47 |

### When route requests fail

`fetchRoute` throws a `RouteError` with a `kind`, and `HomeScreen` shows a matching alert. Only temporary problems offer **Retry**.

| `kind` | Cause | Retry? |
|---|---|---|
| `out-of-area` | A point is outside the map file the server loaded (GraphHopper: "out of bounds") | No |
| `no-path` | A point is inside the map but not near a walkable path, for example in water (GraphHopper: "Cannot find point") | No |
| `no-route` | Both points are valid but not connected by walkable paths | No |
| `server-unreachable` | No internet, the server is stopped, or the ngrok URL is offline or has changed | Yes |
| `timeout` | No answer within 10 seconds | Yes |
| `bad-response` | Anything else unexpected | Yes |

A destination less than 15 m from the start shows "Already there" instead of asking the server.

### What the routes are based on, and what to decide later

For development and testing we use **OpenStreetMap map data** (a downloaded `.osm.pbf` file) with **GraphHopper**, an open-source routing engine that we run ourselves. It is free and has no request limits, but a route is only as good as the map data:

- OpenStreetMap is edited by volunteers, so a path may be missing, closed, or out of date (the file is only as new as its download date).
- "Walkable" does not mean pleasant or accessible. The default `foot` profile can use stairs or rough ground and knows nothing about wheelchairs or visual impairment.
- A start or destination that is not on a path (for example in a lake or a building) is silently moved to the nearest walkable spot.
- Private or gated land may be mapped as walkable.

**Open decision (to discuss with the team):** whether to keep this setup or switch to a hosted service such as the Google Routes API for the real study. Hosted services have fresher data and no server for us to run, but they cost money, have request limits and need an API key. Before any study, walk the chosen routes in person and fix bad stretches.

### Running your own routing server (GraphHopper)

The old shared server is offline, so we run our own with Docker. This is for development only.

1. Download a map of the area, for example Stockholm from <https://download.bbbike.org/osm/bbbike/Stockholm/Stockholm.osm.pbf>, into a folder such as `~/graphhopper-local/`.
2. In that folder create `config.yml`:

   ```yaml
   graphhopper:
     datareader.file: /data/stockholm.osm.pbf
     graph.location: /data/graph-cache
     profiles:
       - name: foot
         custom_model_files: [foot.json]
     profiles_ch: []
     profiles_lm: []
     graph.encoded_values: foot_access, foot_average_speed, foot_priority, foot_road_access, hike_rating, road_class, roundabout, road_environment, country, mtb_rating, ferry_speed
     prepare.min_network_size: 200
     routing.snap_preventions_default: tunnel, bridge, ferry
     graph.dataaccess.default_type: RAM
   server:
     application_connectors:
       - type: http
         port: 8989
         bind_host: 0.0.0.0
     admin_connectors:
       - type: http
         port: 8990
   ```

3. Start it (the first start builds the graph, about a minute for a city):

   ```bash
   docker run -d --name graphhopper -p 8989:8989 -v ~/graphhopper-local:/data israelhikingmap/graphhopper -c /data/config.yml
   curl "localhost:8989/route?point=59.346856,18.072164&point=59.347535,18.073884&profile=foot&points_encoded=false"
   ```

4. Expose it to the phone with [ngrok](https://ngrok.com) (`ngrok http 8989`) and put the URL it prints in `MAP_SERVER_URL` in `util/config.ts`. Free ngrok URLs change every time ngrok restarts, so update it each time.

The server only knows the area in the map file. A start or destination outside it gives "No route found".

### iPhone notes

- A dev build is needed for full haptics (`npx expo run:ios --device`). Expo Go on iOS only gives taps.
- iOS 27 simulators crash this project at launch (the Expo SDK 57 iOS project has no scene delegate), so test on a real phone or an iOS 26 simulator.
- Installing on your own iPhone needs an Apple ID in Xcode and a bundle identifier of your own (the one in `app.json` belongs to another account). Change it only in your local `ios/` project, not in `app.json`.
