# PaceAI Native — Changelog

All notable changes to the Android app are documented here.
Format: `Major.Minor.Patch` — bump Minor for new features, Patch for bug fixes, Major for breaking changes.

---

## [2.3.4] — 2026-05-02

### Fixed
- **Run timer and coach completely stopped when screen locked** — Android's Doze mode and OEM battery optimization throttle the JS thread's `BackgroundTimer` when the phone screen is off (e.g. in a pocket during a long run). The `tick()` call in `BackgroundTimer.setInterval` froze `elapsedSecs`, which in turn prevented every coach trigger (`el > 30`, `el > 60`, etc.) and distance milestones from ever firing. Result: coach log showed only the 3-second `run_start` entry for a 107-minute, 14 km run.

  Fix — two changes:
  1. `tick()` now computes elapsed as `Math.round((Date.now() - startTs) / 1000)` (wall-clock) instead of incrementing by 1 per call. This makes it safe to call from multiple sources and means irregular or skipped calls never cause drift or double-counting.
  2. `tick()` is now also called from inside the GPS background `TaskManager` task. The GPS foreground service is battery-optimization exempt and survives screen lock, so it serves as a reliable timer driver even when `BackgroundTimer` is throttled. `BackgroundTimer` is kept as a backup for when GPS is unavailable (tunnel, indoor).

---

## [2.3.3] — 2026-05-01

### Fixed
- **Foot pod not appearing in Settings scan** — The ESP32 puts its device name in the BLE scan-response packet, not the advertisement packet. Android sometimes skips the scan-response, so `device.name` arrived as `null` and the `!device.name` filter silently dropped the foot pod from the results. Fixed by passing `[FOOT_POD_SERVICE]` as the service UUID filter when scanning for the foot pod (and `[HR_SERVICE]` for HR) — service UUIDs are always in the advertisement packet and are unaffected by the scan-response issue. Also softened the name filter from a hard drop to a fallback `'Unknown Device'` label.

---

## [2.3.2] — 2026-04-30

### Fixed
- **Unclamped array index on corrupt BLE packet** — `STRIKE_LABEL[strikeCode]` and `PRONATION_LABEL[pronationCode]` in `LiveRunScreen` could index past array bounds on corrupt BLE input. Added bounds validation in `bleService.ts` parse layer: values outside `{0,1,2}` are clamped to -1 (unknown).
- **Asymmetric tie-breaking in dominant strike/pronation** — `dominantStrike` and `dominantPronation` previously broke ties toward the pathological type (heel, over). Ties now resolve to the benign type (midfoot, neutral). Both functions also require a minimum of 10 classified samples before returning a non-null label, preventing early-run noise from driving the stored pattern.
- **`az_safe` sign flip at singularity** — `copysignf(0.01f, s.az)` replaces the literal `0.01f` so the clamp preserves the sign of `az` when approaching the ±90° gimbal singularity (low practical risk but correct behaviour).
- **Placeholder text omits new metrics** — "to see impact, GCT and steps" updated to mention strike and pronation.
- **Dead-code fallthrough in dominant-type helpers** — final unreachable `return` statements removed from `dominantStrike`/`dominantPronation`; minimum sample threshold extracted as `MIN_CLASSIFIED_SAMPLES = 10` constant.

### Changed
- Strike/pronation packet-count comment clarified: counters increment per BLE packet (~1 Hz), not per step (~3/s); ratios are valid but raw counts are not step counts.
- Storage comment clarifies terse stored values (`'over'`) vs expanded AI coach prompt values (`'overpronation'`).
- Debug label array comment documents firmware code ordering.
- Firmware: `lastPronation` (toe-off) and `lastStrike` (IC) may refer to different step cycles — noted in GCT_STANCE comment.

---

## [2.3.1] — 2026-04-29

### Fixed
- **Duplicate `onDisconnected` callbacks** — Android GATT fires the disconnect callback multiple times on a single drop event. Without a guard, each call incremented the retry backoff counter and scheduled an additional reconnect timer, causing inflated retry delays and log noise (4× "FP disconnected", 2 retries scheduled simultaneously). Added `if (this.fp !== device) return` / `if (this.hr !== device) return` guards so only the first callback acts; subsequent fires are ignored.

---

## [2.3.0] — 2026-04-28

### Added
- **Foot strike pattern detection** — firmware v2.3 runs a complementary filter (CF_ALPHA=0.98) tracking ankle pitch at 100 Hz. At Initial Contact the pitch delta vs. calibrated neutral classifies each step as **heel** (>+8°), **forefoot** (<−5°), or **midfoot**. Firmware broadcasts the code as field 5 of the BLE CSV.
- **Pronation detection** — signed peak roll deviation during GCT_STANCE classifies each stance as **neutral**, **overpronation** (>+8°), or **rigid/supination** (<−6°). Broadcast as field 6 of the BLE CSV.
- **Backward-compatible BLE parsing** — app handles 4-field packets from old firmware (fields 5/6 default to -1 = unknown). New firmware adds fields 5 and 6; existing 4-field protocol is not changed.
- **Calibrated neutral angles** — after the 10-second gyro/accel calibration pass the firmware takes 200 additional samples to record neutralPitch/neutralRoll at the ankle's actual mounting angle. CF is seeded to this value so classification deltas are orientation-independent.
- **Live POD metrics** — STRIKE and PRONATION displayed on LiveRunScreen POD page alongside existing IMPACT/GCT/STEPS/CADENCE metrics. Pronation shows amber when overpronation is detected.
- **Run summary** — STRIKE and PRONATION cards shown on DoneScreen (only when foot pod data is available). Dominant pattern over the full run is derived from per-type step counts.
- **CSV export** — `strike` and `pronation` columns added to per-run CSV export.
- **AI coach triggers** — `heel_strike` fires when >60% of classified steps are heel strikes (every 90 s, after 30 s elapsed); `overpronation` fires when >50% of stances show excessive roll (every 90 s). Both append to coach log.
- **Run record storage** — `strikePattern` and `pronationPattern` optional fields added to `RunRecord`; old records remain unaffected.

---

## [2.2.3] — 2026-04-26

### Fixed
- **Impact thresholds miscalibrated for rolling average** — v2.2.2 added a 4-value rolling average that produces ~5.8 G (average of ~9 G footstrike and ~2.7 G swing). The old thresholds (base 2.1 G, coach trigger > 2.8 G, UI red > 2.8 G) meant the impact gauge was permanently red and the high-impact coach fired every 90 s regardless of actual form. Updated: `RUNNER.baseImpact` 2.1 → 5.5, fatigue baseline 2.1 → 5.5, coach trigger > 7.5 G, UI red > 8.0 G / warn > 7.0 G.
- **Run summary saves snapshot values, not true averages** — `avgHR`, `avgCadence`, `avgImpact`, `avgGCT`, and `avgPace` all previously saved the last store value at the moment END was tapped (e.g. HR showed 122 bpm when the Garmin recorded a 148 bpm average). Added per-packet accumulators (`hrSum/hrCount`, `cadSum/cadCount`, `impSum/impCount`, `gctSum/gctCount`) to the store, reset at run start, divided at run end for true means. `avgPace` now computed as `elapsedSecs / dist` instead of last instant pace.
- **maxHR always equalled avgHR** — both fields saved the same last-packet value. `maxHR` is now tracked as a running maximum throughout the run.
- **Fatigue cadence input always 170** — `s.cadence || s.runConfig.targetPace ? 170 : 170` (operator-precedence bug) always evaluated to 170, ignoring the real cadence. Fixed to `s.cadence || 170`.

---

## [2.2.2] — 2026-04-26

### Fixed
- **AI coach fires only once per run** — `speak()` had no `tts-cancel` handler. Any audio interruption (phone call, notification, OS audio focus preemption) cancelled TTS without calling `onDone()`, leaving `isSpeaking=true` permanently and silently blocking every subsequent 2-min check-in and trigger for the rest of the run. Fixed: `tts-cancel` now calls `done()` just like `tts-finish` and `tts-error`. Added a 30 s safety timeout as a final fallback.
- **Cadence reads ~360 spm instead of ~180** — `updateFootPod` was doing `cad * 2` on a value the firmware already sends as total spm (both feet). Step-count analysis confirms 3 steps/sec = 180 spm total; the doubling was wrong. Removed the `* 2`.
- **Impact alternates 9 G / 2.7 G every second** — the ESP32 sends one reading per step, alternating between the footstrike peak (~9 G) and the swing/recovery phase (~2.7 G). Added a 4-value rolling average (`impBuffer`) so the display and coach see a stable ~5–6 G rather than wild swings.
- **Accidental END ends the run silently** — tapping END now shows a confirmation alert ("End Run? 1:37:17 · 13.32 km") with a "Keep Running" cancel option, preventing the accidental mid-run termination seen in today's run data.

### Changed
- **AI Coach model updated** to `claude-sonnet-4-6` (latest).

## [2.2.1] — 2026-04-25

### Fixed
- **Explicit connect timeout** — scan-based `connect()` now has a 10 s timeout (previously could hang indefinitely if the device stopped responding mid-handshake).
- **Monitor error → forced reconnect** — if the GATT characteristic subscription dies for any reason (BLE stack error, Android GATT error 133, etc.) the error handler now calls `cancelConnection()` to guarantee `onDisconnected` fires and the normal retry cycle kicks in. Previously the error was logged and ignored, leaving the device in a "connected but no data" limbo.
- **Foot pod data watchdog** — a 3 s interval checks `lastFpPacketTs` while FP is connected. If no packet has arrived for 6 s (the ESP32 sends at 1 Hz) the watchdog forces a disconnect so the retry cycle re-establishes the subscription. Catches silent GATT subscription failures that keep `fpConnected=true` while data has stopped.

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
