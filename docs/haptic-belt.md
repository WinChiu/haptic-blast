# Haptic belt (v2)

This page documents the pivot from the phone-only haptic compass (v1) to a
running belt that gives directions through vibration. It is written as we go,
so the team can follow the same steps and so a later team can see what was done
and what was not.

- **v1** is the tag `v1-haptic-compass` (phone-only, walking). Nothing on this
  branch removes it.
- **v2** is the branch `v2-haptic-belt` (this page).

## Why (from the pivot notes)

The goal is a convincing story for a business, not a finished product. What
matters is the data and the argument. Value proposition: make running feel like
running, not like watching a screen, and let people explore a city without
staring at their gear. The phone is only a prototype device; the end product is
not a phone on a belt. Target group: runners (changed from visually impaired
users and tourists, because we could not find visually impaired users to test
with).

## What we build first: three motors on an Arduino

Two set-ups were specified. We start with the second.

| | Three-phone mode | Three-motor mode (chosen first) |
|---|---|---|
| Output devices | A phone at the front, left and right of the waist | Three vibration motors on an Arduino board |
| Link to the main phone | Peer-to-peer Wi-Fi | Bluetooth Low Energy |
| Why | Needs only phones | Closer to the product; the phone does not have to vibrate, so it can sit in an armband with the screen off (iPhone haptics do not play in the background); less native work |

The main phone does everything: settings, route, GPS, compass, and the vibration
calculation. The Arduino only receives numbers and drives the motors.

## The direction rule

`a` is the bearing to the target relative to where the user faces, in degrees
(positive is to the right). `s` is the half-width of the silent zone.

```
if the user is not yet close to the junction:  all off
if |a| <= s  or  |a| > 90:                     all off
side = min(1, |a| / 45)
main = min(1, (90 - |a|) / 45)
left  = (a < 0) ? side : 0
right = (a > 0) ? side : 0
```

This reproduces every row of the specification table (for example 11.25 degrees
gives a side motor at 25 %, 45 degrees gives 100 %, and at 80 degrees the front
motor is at 22 %), and at most two motors vibrate at once. Targets behind the
user (more than 90 degrees) are ignored in this prototype.

## Decisions so far

| Question | Decision | Status |
|---|---|---|
| What does the belt point at near a junction? | The direction of the next stretch of the route after the junction (the turn), not the junction itself. Along a straight street the belt is silent. | Agreed |
| How early does it start (X)? | Seconds before the junction at the current speed, not metres, so a runner and a walker get the same warning. Proposed start: 8 s, never less than about 15 m. | Proposed values, to tune |
| Pulse style | Build all of them and let the tests decide: continuous, pulsed, steady pulse, rapid taps. The patterns should run on the Arduino, because Bluetooth timing varies by tens of milliseconds. | Planned |
| Repo | Same repo, branch `v2-haptic-belt`; v1 is tagged. | Done |

## Bluetooth interface (from the build guide)

- The board advertises as `HapticBelt`.
- Service `19B10000-E8F2-537E-4F6C-D104768A1214`, characteristic
  `19B10001-E8F2-537E-4F6C-D104768A1214` (write, write without response).
- The phone writes 3 bytes: left, front, right, each 0 to 255, about 5 to 10
  times a second, even when nothing changes.
- **Safety:** the Arduino switches all motors off if it hears nothing for 1.5 s
  or the phone disconnects.
- Many small motors do not spin below about 30 % power, so the app maps 0 to 0
  and anything above 0 to the range 80 to 255 (`80 + p * 175`). The 80 is tuned
  by feel.
- Planned extension: more bytes for a pattern number, so the Arduino plays the
  pattern itself.

## Known risks

- **The compass while running.** All our data is from walking. A belt or arm
  phone is shaken by running, so the compass will be noisier, and at running
  speed GPS direction may be the better source. We need running recordings.
- **Reaching junctions at speed.** GPS updates about once a second, which is
  about 3 m of running; the current 4 m reached-radius could be passed over.
- **Crisp taps.** Small coin motors take tens of milliseconds to spin up, so a
  tap may feel like a short buzz.
- **After a dropped connection** the sketch may need to advertise again; watch
  for this when testing.

## Steps (filled in as we do them)

- [ ] 1. Arduino IDE, board support, BLE library, Blink test, firmware update
- [ ] 2. Wire one motor, run the motor test sketch
- [ ] 3. Wire all three motors
- [ ] 4. Upload the Bluetooth sketch and test it by hand with nRF Connect
- [ ] 5. Direction mixer in the app (pure function with tests from the table)
- [ ] 6. Bluetooth module in the app and one rebuild of the main phone
- [ ] 7. Timing: start the buzz a set number of seconds before the junction
- [ ] 8. Pulse patterns (continuous, pulsed, steady pulse, taps) on the Arduino
- [ ] 9. Running recordings: how good are compass and GPS direction at pace
- [ ] 10. Outdoor trial, then the user test (W44)

Each step gets a short note here when it is done: what we did, what worked, what
did not, and what we would change.
