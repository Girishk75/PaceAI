# PaceAI Native — Changelog

All notable changes to the Android app are documented here.
Format: `Major.Minor.Patch` — bump Minor for new features, Patch for bug fixes, Major for breaking changes.

---

## [2.2.0] — 2026-04-24

### Changed
- **BLE connection — full architectural revamp** — replaced the React-hook-based `useBLE` (fragile `useCallback` dependency chains, recursive scan, stale closures) with a class-based singleton `BLEService` that runs for the entire app lifetime with zero React dependencies.
  - **Direct reconnect after disconnect** — reconnects by saved device ID instantly (no 20-second scan cycle). On Android, GATT connections by MAC address work without re-scanning.
  - **Exponential backoff** — retry delays: 2 s → 5 s → 15 s → 30 s, preventing BLE stack hammering.
  - **Settings scan no longer conflicts with auto-connect** — `SettingsScreen` calls `bleService.pauseForSettings()` on mount (disconnects devices so they advertise) and `bleService.resumeAfterSettings()` on close (reloads saved IDs, restarts auto-connect immediately).
  - **BT toggle handled** — persistent state listener restarts scanning whenever Bluetooth is turned back on.
  - **No recursive scan** — scan timeout uses a clean `setTimeout` gap (5 s) before the next cycle, never calls itself.

## [2.1.7] — 2026-04-24

### Added
- **Device status on Setup screen** — DEVICES section shows live HR and foot pod connection state before starting a run: green dot when connected, amber dot when saved but still searching, grey + CONFIGURE button when not yet set up. Tapping CONFIGURE navigates straight to Settings.

---

## [2.1.6] — 2026-04-23

### Changed
- **HR auto-connect by name reverted** — HR monitor only connects by explicitly saved device ID. Configure once in Settings → HEART RATE MONITOR → SCAN FOR DEVICES → SAVE.

### Fixed
- **Settings scan SAVE not obvious** — each device row in the scan list now shows a green SAVE button so the action is explicit.

---

## [2.1.5] — 2026-04-23

### Fixed
- **Settings scan can't find connected devices** — BLE peripherals stop advertising once connected, so Settings scan was blind to any device still held from a previous run. `useBLE` cleanup now explicitly cancels both connections on unmount (run end / screen change) so devices resume advertising and are immediately discoverable in Settings.
- **Garmin not connecting after settings reset** — HR matching required a saved device ID with no fallback. Added name-based fallback matching `Forerunner`, `Garmin`, `HRM`, `Heart Rate` so the Garmin connects automatically even before it has been saved in Settings.

---

## [2.1.4] — 2026-04-23

### Fixed
- **Unnecessary scan restarts** — scan now checks whether both devices are already connected before restarting after a 30-second timeout, stopping cleanly instead of looping indefinitely.
- **HR debug log flood** — HR packets logged only when BPM value changes (Garmin sends ~2 Hz; logging every packet filled the 200-line cap in ~90 seconds).

---

## [2.1.3] — 2026-04-23

### Fixed
- **BLE connection storm** — scan callback fires multiple times per second for the same device while an async `connect()` is in flight. Without a guard, each callback launched a new `connectHR()`/`connectFootPod()` call. All concurrent attempts collided ("Device already connected"), each failure fired `onDisconnected`, each disconnect spawned another `startScan`, resulting in a "Cannot start scanning operation" death spiral. Fixed with `hrConnecting` / `fpConnecting` ref guards that block duplicate attempts while one is pending.
- **Spurious scan restarts on disconnect** — `onDisconnected` unconditionally set `scanning.current = false` and called `startScan()`, even if a scan was already running (e.g. still looking for the foot pod). This caused repeated "Cannot start scanning operation" errors. Fixed: `onDisconnected` now only starts a new scan if no scan is already active.

---

## [2.1.2] — 2026-04-22

### Fixed
- **BLE race condition — Garmin never connecting** — `onStateChange` fired `startScan()` synchronously before `loadSettings()` resolved, leaving `savedHrId` empty so no HR device was ever matched. Fixed by registering the BLE state listener *inside* the `loadSettings()` callback so saved IDs are always populated before scanning begins.
- **Scan log blindspot** — timeout message now reports how many named devices were seen per cycle (e.g. `scan timeout — 0 named device(s) seen`). Added per-device `seen: "name"` log entries (first 15 per scan) so the log shows whether the scan callback is firing and what's nearby.

---

## [2.1.1] — 2026-04-22

### Fixed
- **BLE reconnect loop** — `onDisconnected` now clears the scan flag and waits 1 s before retrying, preventing silent reconnect failures where the scan was blocked by a stale `scanning=true` state.
- **HR simulated while connected** — `tick()` now uses a 5-second packet-freshness check (`lastHrPacketTs`) instead of the binary `hrConnected` flag to decide between real and simulated HR, eliminating the race where a stale flag caused simulated values to appear while Garmin was live.

### Added
- **Debug overlay** — toggle in Settings → DEBUG. Shows live HR/FP connection status (green = fresh data, amber = BLE connected but no packets, grey = off), packet age in seconds, and a scrollable in-memory log of all BLE events. **SHARE LOG** button opens the Android share sheet to copy or forward the log for diagnostics.

---

## [2.1.0] — 2026-04-21

### Added
- **BLE device picker in Settings** — scan for nearby Bluetooth devices and select your HR monitor and foot pod by name instead of relying on hardcoded name matching. Selected device IDs are saved to storage and used for auto-connect on every subsequent run.

### Changed
- **HR auto-connect** — now connects only to the device explicitly paired in Settings, preventing accidental connections to unrelated BLE devices.
- **Foot pod auto-connect** — uses saved device ID when configured; falls back to `PaceAI-FootPod` name match if not yet configured.

### Removed
- **Run Shield screen** — the hold-to-unlock lock screen was a PWA workaround for accidental touches. Not needed on native Android; the OS handles screen lock natively.
- **Lock icon button** from the live run header.
- **Auto-shield timeout** (3-second auto-lock after entering live run).

### Fixed
- BLE singleton — `BleManager` is now a shared singleton (`bleManager.ts`) used by both `useBLE` and `SettingsScreen`, preventing duplicate BLE manager instances.

---

## [2.0.0] — 2026-04-21

### Added
- Full native Android port of PaceAI (previously a PWA).
- **Live Run screen** — 4 swipeable pages: Clock/Pace/Distance, HR/Cadence/Fatigue, Foot Pod metrics, AI Coach.
- **GPS tracking** via `expo-location` foreground service — survives screen lock, captures distance accurately.
- **BLE foot pod** — connects to ESP32 + MPU6050 over BLE, reads cadence, impact, GCT, steps at 1 Hz.
- **Garmin HR** — standard BLE Heart Rate Profile (0x180D), auto-connects during scan.
- **AI coach** — real-time spoken coaching via Claude API + `react-native-tts` with audio ducking (lowers music while speaking).
- **Background timer** — `react-native-background-timer` keeps the 1 Hz tick alive when screen is locked.
- **HR zones** (Z1–Z5) — zone colour drives accent across all screens (blue → green → amber → orange → red).
- **Fatigue gauge** — 10-segment bar updated from HR, cadence, GCT, and impact data.
- **Run history** and **CSV export**.
- **Settings screen** — Anthropic API key storage.

### Build
- Expo SDK 52, React Native 0.76.5, Gradle 8.10.2.
- `patch-package` fix for `expo-modules-core` Gradle 8 `components.release` incompatibility.
- `expo-build-properties` sets `kotlinVersion=1.9.24` to align Compose Compiler (1.5.14) with the actual Kotlin runtime used by RN 0.76's Gradle plugin.

---

## Versioning rules

| Change type                              | Bump       | Example        |
|------------------------------------------|------------|----------------|
| New screen, major feature, API change    | **Minor**  | 2.1 → 2.2      |
| Bug fix, UI tweak, performance patch     | **Patch**  | 2.1.0 → 2.1.1  |
| Breaking change or full rewrite          | **Major**  | 2.x → 3.0      |

Remember to update `versionCode` (integer, always +1) in `app.json` alongside every release.
