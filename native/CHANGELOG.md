# PaceAI Native — Changelog

All notable changes to the Android app are documented here.
Format: `Major.Minor.Patch` — bump Minor for new features, Patch for bug fixes, Major for breaking changes.

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
