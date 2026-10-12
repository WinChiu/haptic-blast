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
| Device attitude for pocket mode | [`modules/device-attitude`](modules/device-attitude) (local Expo module) | Core Motion, true north when available | — (uses `fused-orientation`) |

To write a new native module, see [Expo Modules API](https://docs.expo.dev/modules/overview/) (`npx create-expo-module --local` creates one under `modules/`).

## How to use the app (for testers and participants)

Haptic Blast guides you by **which way the phone points**, not by where you stand. The buzz and beep compare the direction the phone points with the direction of the next target on the route.

1. In **Settings** (tap the tag at the top of the map), switch on **Haptic Feedback** and/or **Audio Feedback**. Both are off by default and reset when the app restarts.
2. **Long-press** the map to choose a destination, tap **Preview Route**, then **Start**.
3. Hold the phone **flat in front of you with the screen facing up and the top edge pointing forward**. The top edge is what the app reads. (We have not checked how the compass behaves with the phone held upright on iOS.)
4. **Turn slowly** until the buzz or beeping **stops**. You are now facing the direction to walk. Walk that way, keeping the phone pointing the same way.
5. At a turn the target changes and the buzz starts again. Turn until it stops again.
6. The stronger the vibration (and the shorter the pauses), the further off the direction you are. Inside the **silent zone** around the target (default ±15°, **Settings → Haptic tuning**) it is silent, and a very short, light click tells you when you line up.
7. The radar button on the bottom bar opens a Compass screen showing the target direction and where the phone is pointing, which helps when learning.

When you tap **Start**, the app reminds you how to follow the guidance. How it does that depends on **Settings → Journey reminder** (default **Adaptive**):

| Setting | What happens at Start |
|---|---|
| **Adaptive** (default) | The full tip (`components/GuidanceTip.tsx`) until you have **finished 2 journeys**, then a small reminder pill ("Phone flat, top edge forward") for 5 seconds that does not block anything. Its **Steps** link opens the full tip. |
| **Always** | The full tip before every journey. Use this for studies where every participant must get identical instructions. |
| **Off** | Nothing. The full tip also has a "Don't remind me again" link that switches this on. |

The two numbers are `GUIDANCE_TIP.fullUntilFinished` and `compactSeconds` in `util/globals.ts`. The preference and the count of finished journeys are stored on the phone only (`util/guidancePrefs.ts`), so they reset if the app is deleted. The steps are also listed at the bottom of Settings.

**For user testing:** each round saved to Firebase has a `guidanceTip` field (`full`, `compact` or `none`) recording which reminder was shown when it started, so you can compare journeys by reminder. Rounds recorded before this existed do not have the field. The adaptive threshold (2 journeys) is a guess, so revisit it with real data.

If you leave the route for more than a few seconds, the app plans a new route from where you are.

**Testing at a desk with Debug Mode:** only your position is fake (moved with the joystick). The compass is the real phone, so you still have to point it. The joystick lets you walk through buildings and fences, which real people cannot. This causes odd beeping and odd re-routes that do not happen outdoors. Test re-routing outdoors on real paths.

## Hands-free and eyes-free use (open design question)

**The gap.** The app is meant for low-attention, hands-free navigation: blind and low-vision users, and anyone who does not want to hold a phone out (for example at -13 °C in winter). The guidance today assumes the phone is *held* and *pointed*: it compares the direction the phone points with the direction of the next target. The "hold it flat, top edge forward" tip is a way to learn and test the guidance. It is not how the product is meant to be used.

**Why the current design does not work with the phone in a pocket or bag**
1. The phone's orientation has no fixed relationship to the way the person faces.
2. The cue says "you are off" and how much, but **not which way to turn**. Sighted testers find the right direction by sweeping the phone, which a hands-free user cannot do.
3. Silence means "on course", but it also looks the same as "the app stopped".
4. Practical issues we have not tested: vibration is weaker through thick clothing, cold drains the battery, and metal in a pocket disturbs the compass.

**Ways to know which way the person faces**

| Option | How | Strengths | Problems |
|---|---|---|---|
| A. Direction of travel from GPS | Use the direction the person is actually moving | Works with the phone anywhere; no phone orientation needed | Lags by seconds, noisy at slow speed, useless when standing still |
| B. Calibrate phone against body | Walk straight for a few metres; learn the offset between the phone's heading and the walking direction | Uses the compass with the phone in a pocket | More complex; the offset shifts if the phone moves |
| C. Head tracking | Headphones with motion sensors report where the head points | Real facing direction, even when standing | Needs specific hardware; not researched |
| D. Wearable at a fixed place | Chest strap, belt or watch | Stable orientation | Extra hardware |
| E. Learn it automatically while walking | From the first seconds of walking, find the direction the phone moves with each step (the strongest back-and-forth acceleration is along the walking direction), and check it against the GPS direction; no user choices | Nothing to select or calibrate; works for any carry position | Unproven here; needs a few seconds of walking before it is reliable; leg swing, a loose pocket or a phone upside down may spoil it. Needs raw motion data to develop (see "Optional motion sensors") |

A reasonable first prototype is **A as the baseline, with the phone-pointing mode kept for standing at the start**. Microsoft's Soundscape project (discontinued) is, as far as we remember, related prior art. This needs checking before relying on it.

**Ways to give the signal**
- *Signed cues*: one pattern for "turn left", another for "turn right", with intensity for how far. Needs learning.
- *A heartbeat*: a gentle periodic tick while on course, so silence never means "broken".
- *Spoken or audio cues*: blind users often need their ears free for traffic (bone-conduction headphones may help). This is a user-research question.

**Questions for the team**
- Which carry positions matter: pocket, bag, hand, or all?
- Are audio cues allowed, and are wearables in scope?
- Is the study with blind and low-vision users, or with sighted users simulating it (for example blindfolded)? That changes what can be claimed.
- Nobody on the project has asked blind and low-vision users yet. They should be involved early, because they will know things we cannot guess. Safety also needs thought: a foot route may not suit them (crossings, kerbs, hazards), and the guidance should support their own skills, not replace them.

**First step: measure instead of guessing** (see "Walk recording" below). Walk with the phone in a pocket and compare the phone's heading with the GPS direction of travel. That says whether option A or B is good enough.

## Pocket mode (calibration)

Lets the phone ride in a pocket or bag while the buzz still works like a compass. During a journey, tap the phone button next to the compass button.

| Step | User | App |
|---|---|---|
| 1 | Stands still facing the walking direction, holds the phone pointing forward (flat or upright), taps **Calibrate** | Averages the heading for 0.5 s (h0). Fails if the phone moves. |
| 2 | Puts the phone away without turning their body (short buzz = go) | Waits at least 2 s, then for 3 s of stillness (10 s timeout) |
| 3 | — | Picks the more level phone axis (top edge or back camera), locks it, and stores `offset = h0 − h1`. Success or error buzz. |

After calibration, `heading = locked axis heading + offset` with heavier smoothing (no flat/upright switching). If the locked axis tips close to vertical, the heading holds its last value. Guidance is silent while calibrating. Calibration ends with the journey. Settings are in `GlobalStore.CALIBRATION`; the logic is in [`util/calibration.ts`](util/calibration.ts) and tested in `tests/calibration.test.ts`. Walk recordings note `calibration_axis`, `calibration_offset_deg` and `calibrated_at_s`.

Needs a build with the native module: iOS uses `modules/device-attitude` (rebuild after pulling). Android uses the existing sensors. The button is hidden when no source is available (Expo Go on iOS).

**Check on a new iOS build (not yet run on a device):** open the Compass overlay with pocket mode off and the phone flat. **Core Motion top edge** in the debug box should match **Heading** within a few degrees. If it is mirrored or off by 90°, pocket mode is wrong on iOS.

Limits: the person must not turn while putting the phone away; the offset goes stale if the phone shifts in the pocket (recalibrate); a bag that swings or turns on its own will not work well.

## Walk recording

Settings → **Walk recording** records sensor data during a journey so we can answer the questions above. It is **off by default**.

**What is recorded** (at most about twice a second, however often the position updates, from Start until the finish or cancel): time, latitude and longitude, GPS accuracy, speed, GPS direction of travel, the phone's heading (the value the app uses), the direction the guidance is steering towards, the current checkpoint, plus the phone position you chose, haptic and sound settings and the reminder shown. The username is not recorded.

**Where it is kept.** Only on the phone, in the app's private storage (`util/recordingStorage.ts`, the last 5 recordings, saved about once a minute while walking and again at the end). It is **not** sent to Firebase and is not in the repo. It contains a location trace, so share it only with people who should see it. **Deleting or reinstalling the app deletes the recordings, so share them first.**

**Optional motion sensors.** A second switch in the same card also records the accelerometer and gyroscope about 20 times a second (user acceleration, gravity and rotation rate on three axes). It is **off by default**. It exists to develop and test option E above: on the recordings from pocket and bag walks, the direction the phone moves with each step can be compared with the GPS direction, offline, before anything goes into the app. It adds about 2 MB per half hour, so share the full data as the `.csv` file (the text fallback gets very long). In the file it is a second table after the GPS samples, starting with a `# motion` line and the columns `t_ms,ax,ay,az,gx,gy,gz,wx,wy,wz`; the header carries `motion_hz`. The short summary mentions how many readings there are. Storage on Android's AsyncStorage may hit its size limit on long walks; only iPhone has been considered.

**Getting it off the phone.** Settings → Walk recording has two buttons, both open the iPhone share sheet (Mail, AirDrop, Notes, Save to Files):
- **Share short summary (paste-able):** a few lines per recording (how the phone's heading compares with the direction of travel, GPS accuracy, and so on). Small enough to paste into a chat or an email.
- **Share full data (.csv file):** every sample as CSV, with a short header per recording, sent as a real file called `haptic-blast-<date>.csv` (AirDrop, Mail, Messages, Save to Files). A 30-minute walk is about 3,600 lines (roughly 250 KB), too long to paste into most chats, so send it as a file. This uses the native modules `expo-file-system` and `expo-sharing`, so it only works in a build made after they were added (`npx expo run:ios --device`, or the Release build). In an older build the button falls back to sharing the same CSV as plain text, so nothing breaks.

**Label every walk.** Settings → Walk recording has a **label** field. Put the person, route, condition and repeat in it (for example `angel-lappis-pocket-1`) before each walk. It is saved in the recording, so many walks can be told apart and grouped. An empty label is saved as `unlabelled`.

**Analysing it** on a computer:

```bash
npm run analyse-recording -- path/to/recording.txt
pbpaste | npm run analyse-recording     # macOS, with the shared text copied
```

It reports, for the walking samples (speed of at least 0.5 m/s, since real walking pace was 0.9 to 1.1 m/s): how far the phone's heading is from the direction of travel (average and spread), and how often each was within 25° of the guidance target. A small, steady spread suggests the phone's heading can be corrected with a fixed offset; a large spread suggests the phone's orientation is not usable on its own.

To compare many walks, give the tool several files and add `--table`:

```bash
npm run analyse-recording -- --table walk1.csv walk2.csv walk3.csv
```

It prints one row per walk (minutes, walking samples, offset and spread, share of time within 25° of the target by phone heading and by GPS direction, separate stretches of guidance per minute, GPS accuracy), then groups the walks by **carry position and feedback** and shows the **median across walks with the range**. Debug-mode recordings are left out. A group with fewer than 3 walks is marked as anecdotal, because the walk, not the sample, is the unit of analysis (see "How to collect meaningful test data").

**Suggested protocol** (Release build, outdoors, haptics on):
1. Settings → switch recording on, choose where the phone is carried.
2. Walk a route of at least a few hundred metres at a normal pace, in a mostly steady direction for at least 20 seconds at a time.
3. Do one walk per carry position (hand flat, pocket, bag), changing the setting between walks.
4. Note by hand: could you feel the buzz through your clothing? Did the phone move around?
5. Share the recordings before deleting or reinstalling the app.

The recorder logic and the analysis are tested (`tests/recorder.test.ts`). The recorder was tried on a phone in **debug mode**, where positions are fake, speed is 0 and the "direction of travel" is just the phone's heading, so a debug recording says nothing about real walking. A recording made while really walking has not been tried yet.

## Instructions for people doing a walk test

**If you are a teammate trying the app for yourself:** the same steps apply. Two things catch people out: switch recording and haptics on *before* you start (they reset when the app restarts), and delete old recordings first so test runs do not mix with the walk.

Copy or adapt this when asking someone to take part in a walk. Adjust it to the final setup.

**What the app does.** It guides you along a walking route with vibration (and optionally beeps) instead of the screen. It does not tell you where you are on the map. It tells you whether the direction you are facing or moving is right, and how far off you are.

**Before you go**
1. Charge the phone. Cold weather drains the battery quickly, and recording uses GPS the whole time.
2. Make sure the phone has mobile data. Route requests need it.
3. Open the app, tap the tag at the top of the map to open **Settings**, and switch on **Haptic Feedback** (and **Audio Feedback** if you want beeps). These switches reset when the app restarts, so check them every time.
4. If you are helping with the research, switch on **Walk recording** and choose where the phone will be carried. **First delete any old recordings** (Settings → Walk recording → **Delete recordings**, after sharing anything you want to keep). The app keeps the last 5 recordings, and test runs, debug-mode runs and real walks all end up in the same list, so old ones mix with the real data. Each recording says `debug_mode` and `dev_build` in its header, and the analysis tool warns about debug-mode ones, but a clean list is simpler.
   Use a **separate username** for real walks (for example `yourname-walk-1`) so the rounds saved to Firebase are not mixed with desk tests either. Tell the team which usernames are test data.
5. Turn the volume up if you use beeps. Turn on Do Not Disturb so calls do not interrupt.
6. Allow location access when asked, and choose "While using the app" or "Always".
7. **Keep the app open and the screen on.** The app has no background mode: if the screen locks or you switch to another app, it is suspended (no GPS, compass, guidance or recording), and haptics do not play in the background. The app keeps the screen on while a journey is running (`expo-keep-awake`; only in builds made after it was added). Do not switch apps or press the side button during a journey.
8. **If the phone is in a pocket or bag, the screen stays on and can be touched by accident** (for example the red × button). Turn on **Guided Access** (Settings → Accessibility → Guided Access, then triple-click the side button inside the app) to lock the touch screen while the app stays open. Triple-click again and enter the passcode to leave it. We have not tested this combination yet.

**During the walk**
1. Long-press the map to choose a destination, tap **Preview Route**, then **Start**. Read the short tip.
2. At the start, hold the phone flat in front of you, screen up, top edge pointing forward. Turn slowly until the buzz stops. You are now facing the way to walk.
3. Walk that way. If the buzz starts, you have drifted off the direction. At a turn it will start again. Turn until it stops.
4. The stronger and faster the buzz or beeping, the further off you are.
5. If you leave the route, the app plans a new one from where you are after a few seconds.
6. This is a prototype: watch where you are walking. It does not know about traffic, kerbs, steps, ice or closed paths, and the route may use a path that is not passable. Do not rely on it for safety.
7. You can stop at any time with the red × button.

**After the walk** (if recording)
1. Settings → Walk recording → **Share short summary** or **Share full data (.csv file)** and send it to the team.
2. **Do this before deleting or reinstalling the app. Reinstalling deletes the recordings.**
3. Tell the team what you felt: could you feel the buzz through your clothing, did the phone move around, and was anything confusing?
4. Note the **battery percentage and the time at the start and at the end** of the walk (and roughly how cold it was). The screen is kept on during a journey, so this tells us what a journey costs.

**Privacy.** A recording contains your location trace and stays on your phone until you share it. Only share it with people who should see it.

**For the team, current limits** (details in the sections above):
- The routing server currently runs on one team member's laptop and is reached through ngrok, so it must be on, online and awake while anyone walks. The address is that account's free ngrok **dev domain** (`gullible-bulldozer-retype.ngrok-free.dev`), which ngrok describes as stable, so it should not change when ngrok restarts. If a different account runs the tunnel, its address is different and `MAP_SERVER_URL` must be updated and the app rebuilt.
- Routes use OpenStreetMap data, which can be wrong or out of date. Walk each route yourself first.
- The guidance has only been tried at a desk (with a fake position) and not yet on real outdoor walks.
- There is no background mode (only "audio" is declared). The app relies on keeping the screen on; whether the buzz, GPS and recording survive a locked screen has not been tested. Adding background location would change this and needs its own design and permission review.
- The Apple ID signing used for development expires after 7 days. Giving the app to other people's phones needs TestFlight or similar.
- Android is not supported yet.

## Open question: running in the background

For now the app keeps the **screen on** during a journey (`expo-keep-awake`), because it has no background mode and a locked screen suspends it. That is a stopgap for research walks, not the intended design: a screen that stays on costs battery (more in the cold), can be touched by accident in a pocket, and contradicts the screen-free idea.

What running in the background would need, and what is **not yet known** (nothing here has been tested):

| Part | Question |
|---|---|
| GPS | iOS background location mode: needs a permission justification and shows a location indicator. GPS itself also uses battery, so how much is saved is unknown. |
| Compass / GPS direction | Do updates continue in the background? GPS direction of travel (option A above) likely does; the compass is unclear. |
| App code (JavaScript) | Does it keep running while the screen is off? Believed yes with a background location mode, unverified. |
| **Haptics** | As far as we know, iPhone haptics (Core Haptics) do **not** play while the app is in the background. If true, a screen-off haptic-only iPhone app has a platform limit. Audio can run in the background (the "audio" mode), and a watch or other wearable could play haptics. Needs checking. |
| Android | May allow background vibration through a foreground service. Unverified; Android also needs a lot of other work. |
| Privacy | Continuous background location tracking needs a clear justification and consent. |

Ideas to compare: background mode with audio cues; a black "journey in progress" screen (an OLED screen showing black uses little power; not measured); a wearable for the haptics.

Suggested next step: a small **feasibility test** before any design decision. Run a journey with the screen locked and check (1) whether GPS and the app keep running, (2) whether the buzz plays, and (3) the battery use compared with keeping the screen on.

## First real-walk results (2026-10-03)

**Note:** these walks were made when the silent zone was a fixed ±25° and the buzz was continuous. Both are now adjustable (see "Vibration" above), so later walks are not directly comparable unless the settings match. The recordings now carry the settings used.

**What was done.** One person, an iPhone 14 with the Release build (mobile data, laptop routing server), two real outdoor walks of about 3 minutes each in Stockholm (house to ICA Lappis and back), phone **held flat in the hand** both times, haptics and sound on, recording on. A third recording was a debug-mode mistake and is ignored. **This is two walks by one person in one position.** It shows what the data looks like and what to fix. It proves nothing statistically, and **pocket, bag and upright-in-hand positions have not been tried yet.**

**Reported by the walker:** the vibration and beeping worked well, got stronger the more they deviated, and worked well in corners. **At the start the phone began buzzing and beeping straight away, before the walker had done anything, which was confusing and annoying.** That is how the guidance works today (it compares the phone's heading with the target at once, and the person has not turned yet), made worse by the poor start fix described below. Whether it needs a calmer start (a short silent period, or ramping up) is a design decision for the team.
**Battery:** about 97% at the start of the outing and 77% at the end, with the phone at 82% battery health, in the cold, with screen on, GPS, mobile data, haptics and sound. The walker did not time the outing carefully, so this is a rough figure and not a measurement.

| Finding | Walk 1 | Walk 2 (back) | What it means |
|---|---|---|---|
| App kept running (no gaps in the samples after the GPS settled) | yes | yes | The walker did **not** change the phone's Auto-Lock, so `expo-keep-awake` kept the screen on and the app running for the whole walk. |
| GPS accuracy, median / worst | 6.7 m / 24 m | 6.7 m / 29 m | Worse than the 4 m checkpoint distance. Checkpoints were reached mostly through the "walked past within 12 m" rule. Accuracy was 12 to 29 m in the first 30 seconds after standing still. |
| GPS update rate | about 1 per second | about 1 per second | iOS delivers about one fix a second. |
| Phone heading was within 25° of the guidance target | 79% of the time | 84% | With the phone held flat the guidance would fire 16% to 21% of the time, in 10 to 11 separate episodes per walk (about 4 a minute, much more than the 13 per km the simulation predicted for a perfect walker). |
| Compass vs GPS direction of travel: average offset | +7° | +9° | The compass reads about 7° to 9° lower than the true direction. This matches Stockholm's **magnetic declination** (the app uses magnetic north, the routes use true north). The size of the declination is from memory, not checked. |
| Compass vs GPS direction: spread | 34° | 25° | The instant GPS direction at walking pace is noisy. |
| Target direction change when the first checkpoint was passed | 70° | 104° | Large swing at the start, caused by GPS wander (see below). Later checkpoint changes were 10° to 20°. |

**GPS direction alone is not good enough at walking pace (option A above).** Using the walking direction instead of the compass, the phone's instant GPS direction was within 25° of the target on 76% of walking samples, against 83% to 87% for the hand-held compass. Working the direction out from position changes over 4 to 12 seconds was **worse**, not better (spread 33° to 38° against 25°). So a GPS-only version would send wrong signals about a quarter of the time, and says nothing when the person stands still. It could be a useful part of a mix, not a replacement. (Walking pace was about 0.9 to 1.1 m/s, so a 1 m/s speed filter drops many samples; the analysis should use about 0.5 m/s.)

**Problems found, in order of how clear the evidence is**
1. **The compass uses magnetic north.** About 7° to 9° of the 25° tolerance is lost to the offset. `expo-location` can supply a true heading; using it, or applying the declination, is a small change. Not done yet.
2. **A poor GPS fix at the start misleads the route.** The route is planned from the GPS position at the moment of Preview. With an accuracy of 13 to 29 m, that position can be 15 to 40 m from where the person really is, so the first checkpoint is somewhere else. In walk 1, GPS wander while the walker stood still moved the route on by a checkpoint. In walk 2, the person was steered towards a first checkpoint about 40 m away for 17 s, then the target swung 104°. Candidate fixes (not built): wait for an accuracy of about 12 m or better before Preview and Start, and ignore checkpoint progress from fixes with poor accuracy.
3. **The 4 m checkpoint distance is smaller than the GPS accuracy.** It works only because of the 12 m "walked past" rule. Worth tuning with more data.
4. **Which of haptics or sound helped?** Both were on. This is not separated.

**What the data cannot say yet:** how the compass behaves in a pocket, bag or when held upright (the main question for hands-free use), anything at other times of year or in cold, battery use (the walker should have noted start and end percentages), or whether the screen stayed on because of the app or because of the phone's Auto-Lock setting.

**Suggested next steps**
1. Fix 1 (true north) and 2 (wait for a good GPS fix) and repeat the same route to see the difference.
2. Walk the same short route in each carry position (**pocket, bag, hand upright**), haptics only, with recording on. Then run `npm run analyse-recording`. This is the data that decides the hands-free design.
3. Separate haptics from sound in at least one walk each.
4. Test with the screen locked on purpose (Auto-Lock short, keep-awake off), to learn what really happens in the background.

### Changes made after the first walks (not yet tried on a phone)

- **True north.** On iOS the compass now prefers `trueHeading` and falls back to the magnetic heading when it is not available (`pickHeading` in `util/gps.ts`, used in `hooks/useCompass.ts`). **Check:** on a hand-flat walk, the average difference between GPS direction and phone heading should drop from about +8° to about 0°. Recordings now carry `heading_reference=true-north-preferred` in the header; older recordings are magnetic.
- **Wait for a good GPS fix.** Preview Route and Start are disabled, with the label "Finding your location…" ("Waiting for GPS (±N m)" when Debug Mode is on), until the latest fix is accurate to 10 m or better (`GPS.maxStartAccuracy` in `util/globals.ts`). Fixes worse than 20 m (`GPS.maxUsableAccuracy`) are ignored for route progress and off-route detection, but are still recorded. Debug mode (joystick) never waits. **Check:** the first checkpoint should be near you, and standing still should not move the route on.
- **One step at a time.** The home screen first asks "Where do you want to go?" (press and hold on the map) with no button. Only after a place is chosen does "Preview Route" appear, then "Start". In Settings the everyday switches (vibration, sound), the guidance steps, the reminder and the username come first; the research and tuning cards sit behind "Show advanced and research settings".
- Not changed then: the buzz at the start and the 4 m checkpoint distance. The silent zone has since become adjustable (default ±15°).

### How to collect meaningful test data before user testing

The two walks above are a **pilot**: they find problems and give rough numbers. They cannot support claims such as "the pocket is as good as the hand". To get data that can, plan it before walking.

1. **Write down the questions first.** For example: (a) does the compass heading in a pocket, bag or upright hand agree with the direction of travel well enough? (b) do haptics, sound or both work better? (c) what does a journey cost in battery? (d) is the start of a journey understandable?
2. **Choose the conditions** and test every one: carry position (hand flat, hand upright, pocket, bag), feedback (haptics only, sound only, both), and at least two routes (one with a long straight, one with curves and corners). Walk a fixed route, so differences come from the condition and not the route.
3. **Repeat.** Samples within one walk are not independent (a second of data is almost the same as the next), so **the walk is the unit of analysis, not the sample**. Aim for at least 3 walks per condition per person, and at least 3 different people (different phones, heights, walking speeds). Keep walks of at least a few minutes, so there are hundreds of samples to summarise.
4. **Reduce bias.** Vary the order of conditions between people or days (do not always test the pocket last, when the walker is tired or cold), keep the same build of the app, and avoid mixing in debug-mode runs.
5. **Record what the app does not.** One line per walk in a shared sheet: walk ID, person, route, carry position, feedback setting, app build date, start and end time, battery % at both, weather and temperature, and a short note or a 1 to 5 rating for how clear and how annoying the guidance felt. Give each person a separate username.
6. **Name the things you will compare in advance:** for example, median and spread of the compass vs GPS direction offset, the share of time within 25° of the target, episodes of guidance per minute, and battery per 10 minutes. Summarise each walk first, then compare walks.
7. **Be honest about the claim.** A pilot of a few people supports "this looks promising, here is what to fix". It does not prove anything about blind or low-vision users. Testing with blind or low-vision participants needs their involvement in the design, the approval your university requires, and a safe route. Use sighted pilots only on quiet, safe routes.
8. **Decide the stopping rules now.** For example: ready for user testing when the compass or GPS approach in the chosen carry position is within 25° of the target on most walks, the start of a journey is not confusing, there are no crashes or silent suspensions, and the battery use is acceptable to the team.

Possible tooling to add if the team wants it: a free-text "walk label" (person, route, condition) saved in each recording, and a table in the analysis tool that groups many recordings by condition.

### After a laptop restart (resuming the local setup)

The routing server, the tunnel and the build all live on one team member's laptop.
1. Start **Docker Desktop**, then `docker start graphhopper` (the first start after a restart takes about a minute; check `curl localhost:8989/health`).
2. Start the tunnel: `ngrok http 8989 --url https://gullible-bulldozer-retype.ngrok-free.dev` (this account's free dev domain; naming it explicitly makes sure the same address is used). ngrok's documentation calls a dev domain a stable, auto-assigned hostname, and the same address came back after every restart we did, so the address built into the app should stay valid. We have **not** tested a full laptop reboot or a long gap. If the address ever differs from `MAP_SERVER_URL` in `util/config.ts` (for example when another account runs the tunnel), update it and rebuild, or the phone will try a dead address. Check with `curl https://<address>/health` (it should print `OK`).
3. Keep the laptop awake while anyone walks (`caffeinate -dimsu -t 21600` keeps a Mac awake for 6 hours) and plugged in, with the lid open.
4. Rebuild and install when needed: `npx expo run:ios --device <device-id> --configuration Release` (about 15 minutes, phone unlocked and plugged in). The `ios/` folder is not in the repository: it holds your own signing settings and bundle identifier, so do not regenerate it with `expo prebuild`.
5. Run `npm install` after pulling new commits, and `npm run test:logic` to check the logic.

## Tests

The route logic is plain TypeScript with no React or phone dependencies, so it is tested on your computer with Node's built-in test runner (run through [`tsx`](https://tsx.is), a dev dependency):

```bash
npm run test:logic
```

(`npm test` is already used for the Expo tunnel, so the tests have their own script.) They take about a second, need no phone, no Docker and no network.

| File | Covers |
|---|---|
| `tests/geo.test.ts` | distance, bearing, distance to a line, "past a point", interpolation |
| `tests/checkpoints.test.ts` | checkpoint generation on a real 3.1 km route: first and last kept, no gap over `maxSpacing`, turns kept, edge cases |
| `tests/progress.test.ts` | "checkpoint reached" (including walked-past drift), skipping ahead, distance to the route, aiming ahead |
| `tests/routing.test.ts` | `fetchRoute` with a mocked server: parsing, and each `RouteError` kind and whether it is retryable |

`tests/fixtures/stockholm-walk.json` is a real GraphHopper response, so the tests need no server. If you change a setting in `GlobalStore` (for example `CHECKPOINTS` or `CHECKPOINT_PASS_RADIUS`), a failing test tells you what the change affects. Update the test's expectation only if the new behaviour is intended.

Not covered: anything that needs a phone (compass, haptics, GPS, the map, screens), and the real routing server. Those need testing on a device; see "How to use the app".

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
2. the user is within `CHECKPOINT_PASS_RADIUS` (12 m) of it **and has already gone past it along the leg they were walking** (from the previous checkpoint to this one; `isCheckpointReached` in `util/progress.ts`). The first checkpoint has no previous one, so only rule 1 applies to it.

Rule 2 exists because of GPS drift: walking past a checkpoint 6 m to the side never enters the 4 m circle, so the buzz would keep pointing back at it. The logic is in `checkpointStep` (`util/progress.ts`), called from the "Calculate Next Checkpoint" effect in `components/Map.tsx`.

Known limits: a walker who passes a checkpoint from more than 12 m away (cutting a corner) is not counted as past it until the skip-ahead rule below finds a nearer checkpoint, and a **round-trip route whose destination is next to its start** makes the skip-ahead rule treat the destination as reached at once.

### Corners (teammate feedback)

**Report:** at a sharp corner the checkpoint disappeared and the compass told the walker to turn before the corner, which could walk them into the wall (sketch: a wall on the right, the next leg turning right along the building).

**Reproduced** with the app's own functions (a 60 m wall, a 90° corner, GPS wobble 0, 3 and 6 m) and **two causes** found:
1. The "walked past" rule used to be judged along the leg that comes **next**. At a corner that leg points sideways, so for someone still walking up to the corner the sign flipped with a metre or two of GPS wobble: the corner counted as reached **11.4 m early** at 3 m wobble and **8.4 m early** at 6 m. (The real walks showed the same signature: many "walked past" events at 11.9 to 12.0 m.)
2. The aim-ahead point (`AIM_LOOKAHEAD`, then 15 m, now 25 m) aimed round the corner, so even a perfect walker saw the guidance start turning **12 m before the corner** (14° at 12 m, 70° at 4 m).

**Fix:** the walked-past rule now uses the leg being walked (previous to current checkpoint), and the aim-ahead point stops at a checkpoint where the route turns by more than `AIM_MAX_TURN` (60°), so the guidance keeps pointing at the corner until it is reached. Gentle bends still get the smoothing.

| Sketch (90° corner) | Before | After |
|---|---|---|
| Counted as reached, 0 m wobble | 4.0 m before | 4.0 m before |
| 3 m wobble | 11.4 m before | 3.0 m before |
| 6 m wobble | 8.4 m before | 2.5 m before |
| Guidance direction 12 / 8 / 4 m before (0° is straight on) | 14° / 41° / 70° | 0° / 0° / 0° |

**Cost, measured on the real 3.1 km route** with a simulated perfect walker (not a field test): the share of time the phone is more than 25° off barely changes (about 9% to 10%), but the number of separate guidance episodes rises because the direction now changes at the corner instead of gradually before it:

| `AIM_MAX_TURN` | Episodes over 3.1 km |
|---|---|
| 180° (old behaviour, never stop) | 41 |
| 90° | 41 (misses the 90° corners) |
| **60° (chosen)** | **47** |
| 50° | 50 |
| 40° | 53 |
| 30° | 56 |

It is a setting in `util/globals.ts`: lower protects more corners and gives more episodes. What no setting can fix: with about 6 m of GPS error the app cannot know where the wall is. It only avoids adding error of its own. Tests: `tests/corner.test.ts` (the sketch, a U-turn, a gentle bend, a real overshoot) and the updated `tests/progress.test.ts`.

### Vibration (Haptic tuning)

How the phone vibrates follows the team's **Vibration Design Guide** (PDF). The shape lives in `util/haptics.ts` (pure functions with tests in `tests/haptics.test.ts`), the loop in `hooks/useGuidance.ts` and the driver in `hooks/useBuzz.ts`. Everything adjustable is in **Settings → Haptic tuning**, saved on the phone, kept inside the guide's ranges, and written into each recording's header (`haptic_mode`, `deadband_deg`, `pulse_ms`, `confirm_ms`), so walks can be compared by setting. **Not yet felt on a phone**: timing and feel can only be judged on a device.

| Guide | Built | Default (range) |
|---|---|---|
| Intensity grows **exponentially** with the error, weakest at the edge of the dead zone, not at 0° (`S0 · e^(b·y)`, `b` worked out from the weakest and strongest values) | `exponentialIntensity`: 0.2 at the edge of the silent zone, 1.0 at 90° off, equal angle steps give equal ratios | fixed shape |
| **Silent zone** (deadband) | silent inside ±N° of the target; also draws the cone on the Compass screen (the cone shows the zone in force, so it widens with GPS error) | ±15° (5 to 15); widens automatically when GPS is poor, up to ±25° |
| **Weakest buzz** (`minStrength`) | strength just outside the silent zone; it rises from here to full strength at 90° off. Raised from the guide's 20% (then 40%) after testers could not feel the weaker levels | 50% (20 to 70) |
| **Pulse** of about 750 ms | one pulse per cycle while off course | 750 ms (500 to 1000) |
| **Pause** 200 ms at maximum deviation up to 600 ms near the dead zone | `pauseForDeviation`, linear between the two | 600 ms to 200 ms |
| **Focus lock confirmation** pulse | one light click when the phone lines up; it also cuts a running pulse short; at most one every 1.5 s so noise at the edge cannot machine-gun it | 50 ms (50 to 100) |
| **Off-course mode** (silent when on course) | already how the app works | always |
| Adjustable in the UI | steppers, a "Feel it" demo (slightly / more / far off, then the click) and "Reset to the guide's defaults" | |

**Rhythm does not restart when you turn.** The pulse timing (`stepPulse` in `util/haptics.ts`) is kept across the edge of the silent zone: going in and out of the zone never makes the next pulse come early. A running pulse is still cut short when you line up (silence on course).

**Pulsed, steady pulse or continuous.** Pulsed is the default. **Steady pulse** uses the same three settings (silent zone, pulse length, lined-up click) but every pulse and every pause is the same length (pause fixed at 400 ms, `pauseSteadyMs`); only the strength grows with the angle error, and there is no extra pattern. While a pulse is running its strength follows the angle (smoothed, `LEVEL_SMOOTHING`), so the buzz tracks a turn immediately; the pulse length and the silence never change. It records `hapticStyle` as `steady-pulse` and `haptic_mode=steady` in the recording header. The earlier continuous buzz (the team's choice in commit `7d11c0b`) is kept as a switch, uses the same exponential strength, and records `hapticStyle` as `continuous` (pulsed is `pulse`) in each round. Sound beeps keep their previous timing but now stop inside the silent zone too.

**Not built:** the guide's **adaptive deadband** (wide while exploring, narrowing when stable, depending on distance to the target). It is described there as rationale and is not in its settings list.

**Accuracy changes (guidance position).** The guidance uses your position snapped onto the planned path when you are within 20 m of it (`GPS.snapLimit`), because GPS error drifts sideways and swings the direction. In a simulation of a perfect walker on the real 3.1 km route, with GPS error that wanders over about 10 s, snapping cut the median direction error from 11 to 12° down to 7° at 6.7 m accuracy, and from 15° to 7° at 12 m. The aim point is 25 m ahead (`AIM_LOOKAHEAD`), the walk will not start until GPS is within 10 m, and the silent zone grows with the GPS error (`effectiveDeadband`, capped at ±25°) so the phone does not buzz at noise. Recordings log the zone used (`zone_deg`) and the snap distance (`snap_m`). These are simulation results; the outing checks them.

**Expect more guidance than before.** The earlier walks used a fixed ±25° zone and the phone was within it about 80% of the time; ±10° is much tighter, so expect more pulses. The guide itself says to feel the values within the ranges, which is what the settings are for. Compare recordings with the table tool, which now judges each walk against the zone it was recorded with.

### When the user leaves the route

Users can cut a corner or take another way. The guidance handles it in two ways (logic in `util/progress.ts`, wired up in `components/Map.tsx`; tuning in `util/globals.ts`):

1. **Skip to a checkpoint further along (`CHECKPOINT_SKIP`).** If the user gets within `radius` (15 m) of one of the next `lookahead` (5) checkpoints, or of the **final** checkpoint, guidance jumps to it instead of pointing back at one they will not walk to. Because the final checkpoint is always a candidate, arriving at the destination ends the round even if checkpoints were skipped.
2. **Re-plan from where they are (`OFF_ROUTE`).** While navigating, if the user is more than `distance` (30 m) from the route line for `seconds` (5 s), the app asks the server for a new route from the current position to the same destination and replaces the old one. At most one new route per `cooldownSeconds` (15 s). If the request fails, the old route stays and it tries again after the cooldown. The map does not re-zoom when a route is replaced.

Known limits:
- A route that doubles back on itself within 15 m can make the skip rule jump too far; check this with real routes.
- Someone standing more than 30 m from any path (for example in a field) triggers a new route request every 15 s, because the new route starts at the nearest path.
- Re-routing needs the routing server. Without it the user keeps following the old route.
- The study may want people to follow the suggested path only. If so, set `OFF_ROUTE.distance` very high and `CHECKPOINT_SKIP.radius` to 0, and discuss it with the team.

Log lines to look for in the Metro log: `[nav] skipped ahead from checkpoint 2 to 4`, `[route] off route by more than 30 m, re-routing`, `[route] re-routed: N new points`.

### When route requests fail

`fetchRoute` throws a `RouteError` with a `kind`, and `HomeScreen` shows a matching alert. Only temporary problems offer **Retry**.

| `kind` | Cause | Retry? |
|---|---|---|
| `out-of-area` | A point is outside the map file the server loaded (GraphHopper: "out of bounds") | No |
| `no-path` | A point is inside the map but not near a walkable path, for example in water (GraphHopper: "Cannot find point") | No |
| `no-route` | Both points are valid but not connected by walkable paths | No |
| `server-unreachable` | No internet, the server is stopped, or the ngrok tunnel is offline, or its address differs from `MAP_SERVER_URL` | Yes |
| `timeout` | No answer within 10 seconds | Yes |
| `bad-response` | Anything else unexpected | Yes |

A destination less than 15 m from the start shows "Already there" instead of asking the server.

### Map background (open issue)

**The problem.** The original code hid the platform map (`mapType="none"`) and drew tiles from our own tile server (`API_ENDPOINTS.TILES` in `util/config.ts`). That tile server was a teammate's temporary ngrok address, which is now offline, and no replacement exists. Effects:

- **iOS:** Apple Maps shows through anyway (iOS ignores `mapType="none"`), so the map looked fine, but every pan or zoom sent tile requests that failed with 404 through ngrok. Those wasted requests could crowd out route requests on ngrok's free plan.
- **Android:** with `mapType="none"` and no tiles, the map is most likely **blank** (read from the code; not run on Android by us).

**The temporary change (2026-10-03).** One flag, `USE_SELF_HOSTED_TILES` in `util/config.ts`, now set to `false`:

| Flag | Map type | Tile layer | Needs |
|---|---|---|---|
| `false` (current) | `standard`: Apple Maps on iOS, Google map on Android | not rendered, no tile requests | Android needs `GOOGLE_MAPS_ANDROID_API_KEY` (already required, see the Android setup) |
| `true` | `none` | `UrlTile` from `API_ENDPOINTS.TILES` | a running tile server |

To go back to the old behaviour, set the flag to `true` once a tile server is available. The code that uses the flag is in `components/Map.tsx` (`mapType` and the `UrlTile` block).

**Not yet verified:** the Android map with `false` has not been run by us (no Android device). Please check that the map, route line, checkpoints and pin show, and report back.

**Options for a permanent solution (to decide as a team):**

| Option | Cost | Pros | Cons |
|---|---|---|---|
| **1. Keep platform maps** (what the flag does now) | Free to use; check Google's pricing and quota for the key | Nothing to run or host, works on both systems | Depends on Apple and Google; look and data can't be customised; Google usage may be billed |
| **2. Our own tile server** (for example `tileserver-gl` in Docker with OpenMapTiles/OpenStreetMap data for the test area, exposed with ngrok or hosted) | Free software and data; about 1–2 hours plus a large download; needs a machine that stays on | Independent of Google and Apple; same map on both systems; works with the self-hosted routing | Another server to keep running; the ngrok free plan has request limits; OpenStreetMap credit must be shown |
| **3. Hosted tile service** (for example MapTiler or similar, with an API key) | Free tiers exist, limits and terms vary, check before relying on it | No server to run | Needs an account and key; usage limits; terms may restrict how it is used |
| **4. Pre-downloaded offline tiles** bundled for the test area | Free; the area is fixed in advance | Works with no internet; fits fixed study routes | Larger app; only covers the chosen area |

**Do not use the public OpenStreetMap tile servers** (`tile.openstreetmap.org`) for this: their usage policy forbids heavy use from apps.

### What the routes are based on, and what to decide later

For development and testing we use **OpenStreetMap map data** (a downloaded `.osm.pbf` file) with **GraphHopper**, an open-source routing engine that we run ourselves. It is free and has no request limits, but a route is only as good as the map data:

- OpenStreetMap is edited by volunteers, so a path may be missing, closed, or out of date (the file is only as new as its download date).
- "Walkable" does not mean pleasant or accessible. The default `foot` profile can use stairs or rough ground and knows nothing about wheelchairs or visual impairment.
- A start or destination that is not on a path (for example in a lake or a building) is silently moved to the nearest walkable spot.
- Private or gated land may be mapped as walkable.

**Credit.** The routes use OpenStreetMap data (ODbL). The OpenStreetMap Foundation's [attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) say the credit must name OpenStreetMap ("© OpenStreetMap contributors" is acceptable), make clear the data is available under the Open Database License, and link to <https://www.openstreetmap.org/copyright>. For mobile apps they allow the credit in an "About" menu option. The app shows it in **Settings → Map data**. Routing results do not need the credit attached, as long as we do not build a "derivative database" from OpenStreetMap data (for example, storing or publishing large extracts of it). Saving individual walked routes is very unlikely to count, but check if the team ever plans to store or share bulk map data. This was read from the guidelines, not checked with a lawyer; confirm with the project owner or university before a public release. If the routing data source changes, update the credit.

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

4. Expose it to the phone with [ngrok](https://ngrok.com): `ngrok http 8989`, or `ngrok http 8989 --url https://<your-dev-domain>` to use the free dev domain your account is assigned (see the ngrok dashboard, Domains). Put that address in `MAP_SERVER_URL` in `util/config.ts`. A different account has a different address.

The server only knows the area in the map file. A start or destination outside it gives "No route found".

### iPhone notes

- A dev build is needed for full haptics (`npx expo run:ios --device`). Expo Go on iOS only gives taps.
- **iOS 27.** iOS 27 refuses to launch an app built with its SDK unless it uses the scene-based life cycle ("UIScene lifecycle is required for apps built with this SDK"). The Expo SDK 57 iOS template does not, so an unpatched build **crashes at launch on an iOS 27 phone or simulator** (we saw it in the simulator; iOS 26 phones are fine). `plugins/withIosSceneLifecycle.js`, registered in `app.json`, applies the same three changes as the SDK 58 template: a scene manifest in `Info.plist`, an `AppDelegate` that no longer creates the window, and a `SceneDelegate`. It is tested as code (`tests/sceneLifecycle.test.ts`) and was applied by hand to the local `ios/` project of the person building; it has been tried on an iOS 27 iPhone only if the line below says so. If you already have an `ios/` folder from before the plugin existed, `expo prebuild` (without `--clean`) does not necessarily re-apply it, so check that `ios/<app>/AppDelegate.swift` mentions `SceneDelegate`. Remove the plugin when upgrading to SDK 58.
  **Status:** not yet confirmed on an iOS 27 device.
- Installing on your own iPhone needs an Apple ID in Xcode and a bundle identifier of your own (the one in `app.json` belongs to another account). Change it only in your local `ios/` project, not in `app.json`.
