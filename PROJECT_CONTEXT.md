# PaceAI — Project Context

> Handoff document for a new session or a different LLM tool. It captures **why** the project is built the way it is, not just what the code does. For task-level open items see `BACKLOG.md`; for build/versioning rules see `CLAUDE.md`; for release-by-release detail see `native/CHANGELOG.md`.

Last updated: 2026-07-20 · App v2.4.3 (versionCode 29) · Firmware v2.5

---

## 1. Purpose

PaceAI is a **real-time running coach** for a single runner (Girish, Mumbai). It listens to live sensor data during a run and speaks short, specific coaching cues out loud — "ease off, you're in Zone 3 on an easy run", "cadence dropped to 150, quicken your steps". It is not a post-run analytics app; the value is *in the moment*.

What makes it different from a Garmin watch: it fuses a **custom-built ESP32 ankle foot pod** (cadence, ground-contact time, impact G, foot-strike type, pronation) with phone GPS and a standard BLE heart-rate strap, then feeds all of that to an LLM that generates context-aware spoken advice. The runner's profile (max HR 185, resting 65, baseline cadence 172 spm, GCT 245 ms, impact 5.5 G) is baked into `native/src/constants/runner.ts` and injected into every coaching prompt.

Target environment: Android phone, warm/humid Mumbai morning runs, screen locked in a pocket or armband.

---

## 2. Architecture

Three cooperating pieces:

```
┌────────────────────┐     BLE notify (1 Hz)      ┌─────────────────────┐
│  ESP32 Foot Pod     │  "cad,imp,gct,steps,       │   Android App        │
│  (MPU6050 @ ankle)  │───strike,pronation" ──────▶│   (React Native)     │
│  firmware v2.5      │◀── 'R' = recalibrate ──────│                      │
└────────────────────┘                            │  ┌────────────────┐  │
                                                   │  │  Zustand store  │  │
┌────────────────────┐     BLE notify (HR)         │  │  (runStore.ts)  │  │
│  Garmin HR strap    │───────────────────────────▶│  └───────┬────────┘  │
│  (std HR profile)   │                            │          │           │
└────────────────────┘                            │          ▼           │
                                                   │  ┌────────────────┐  │
   Phone GPS ─────────── background location ─────▶│  │  aiCoach.ts     │  │
                                                   │  │  checkTrigger → │──┼──▶ Claude API
                                                   │  │  fireCoach      │  │   ↓ text
                                                   │  └────────────────┘  │   ↓
                                                   │      react-native-tts │──▶ 🔊 spoken cue
                                                   └─────────────────────┘
```

### App layers (`native/src/`)
- **`store/runStore.ts`** — single Zustand store, the whole run's state. All mutations go through actions; nothing writes state directly. `tick()` is the heartbeat.
- **`services/`**
  - `bleManager.ts` — the shared `BleManager` singleton (one instance, ever).
  - `bleService.ts` — scan / connect / reconnect / watchdog for both foot pod and HR strap; parses the pod CSV; sends the recalibrate command.
  - `aiCoach.ts` — `checkTrigger(state)` decides *if/what* to coach; `fireCoach()` builds the prompt, calls the Claude API, speaks the result via TTS, and logs the event.
  - `storage.ts` — AsyncStorage settings (apiKey, saved device IDs/names, debugMode).
  - `debugLogFile.ts` — crash-safe run logging (atomic `.tmp`→rename), shareable from Settings.
- **`hooks/`**
  - `useGPS.ts` — background location via `expo-location` foreground service; also drives `tick()`.
  - `useBLE.ts` — hook wrapper around `bleService`.
- **`algorithms/`** — pure functions: `gps.ts` (haversine + pace smoother), `fatigue.ts` (0–10 composite index), `hrZone.ts`.
- **`screens/`** — Setup, LiveRun, Paused, Done, History, Settings, RunShield.

### Firmware (`firmware/PaceAI_FootPod_v2/PaceAI_FootPod_v2.ino`)
Single Arduino sketch. ESP32 DevKit + MPU6050 at the ankle, direct I2C (no MPU library). 100 Hz sample loop, 1 Hz BLE broadcast. State machine per footstep: strike detection (impact) + a two-stage gyro GCT machine (`GCT_IDLE → GCT_SETTLING → GCT_STANCE → GCT_IDLE`). Also classifies foot strike (heel/mid/fore) from pitch and pronation (neutral/over/rigid) from roll, using a complementary filter.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| App framework | React Native, **Expo SDK 52** (bare workflow via prebuild) |
| Language | TypeScript |
| State | Zustand |
| BLE | `react-native-ble-plx` |
| GPS | `expo-location` (background foreground-service) |
| Speech | `react-native-tts` |
| Storage | `@react-native-async-storage/async-storage`, `expo-file-system` |
| LLM | Claude API (model id string lives in `aiCoach.ts`) |
| Firmware | Arduino C++ on ESP32, `BLEDevice`/`BLE2902`, raw I2C to MPU6050 |
| Build | **Local Gradle on Windows** — never EAS (see below) |

---

## 4. Key Decisions (and why)

**BLE broadcast format is frozen.** `"cadence,impact,gct,steps,strike,pronation"` CSV, service/char UUIDs in `native/src/constants/ble.ts` must equal the firmware `#define`s. Any change breaks the app↔pod contract. Fields 5–6 (strike/pronation) were added in v2.3; the app treats missing fields as `-1` so old firmware still parses.

**Gyro-only calibration, magnitude-based detection.** The original bug: standard MPU libraries zero each accel axis and force Z→1 G, which assumes a flat mount. At the ankle the sensor sits at any angle, so the library was cancelling real gravity. Fix: calibrate gyro offsets only, and use `|a| = √(ax²+ay²+az²)` (always ≈1 G at rest regardless of orientation) for impact detection. This is why "Neutral pitch −177°" in the Serial log is *normal* — the board is mounted facing down, and everything downstream is delta-based.

**Two-stage gyro GCT instead of a fixed timeout.** v1.1 hit its safety timeout on every step. v2 waits for the gyro to settle (foot planted), then watches for the gyro to rise again (toe-off). Thresholds have been the single hardest thing to tune — see §6.

**`tick()` is wall-clock and idempotent.** It's called from *both* `BackgroundTimer` and the GPS `TaskManager` task (so the timer survives Android Doze when the screen locks). Because it computes elapsed from `Date.now() - startTs` rather than incrementing a counter, calling it twice a second is safe. This was the fix for the v2.3.10 distance-doubling bug.

**TX power reduced to −6 dBm.** Default +9 dBm drew enough current to sag a small LiPo and stop BLE from starting on battery. −6 dBm still reaches phone-on-ankle range.

**Recalibrate over BLE uses a volatile flag, not a direct call.** The write callback runs in the FreeRTOS BLE task; calling the 12-second blocking `calibrate()` from there would stall the stack. Instead `onWrite` sets `volatile bool recalRequested`, and the main `loop()` consumes it between samples. Write is **write-without-response** (`PROPERTY_WRITE_NR`) — write-with-response was silently rejected by the characteristic and never reached `onWrite`.

**Distance and pace use different GPS gates (v2.4.3).** The pace smoother trusts fixes up to 150 m accuracy (it filters internally and matched Garmin). The *distance odometer* was summing 1 Hz urban jitter as real movement (+20% vs Garmin). Distance now has its own stricter gates: 35 m accuracy ceiling, minimum step `max(8 m, accuracy/2)`, and a 6.5 m/s implied-speed cap that rejects GPS jumps (re-anchoring so the jump isn't re-measured later).

**Build is local Gradle on Windows, never EAS.** EAS `--local` doesn't run on Windows, and cloud EAS was explicitly ruled out. Canonical steps are in `CLAUDE.md` and the `firmware-flash-checklist` skill: `git pull` → `npx expo prebuild --platform android --clean` → `gradlew assembleRelease --rerun-tasks --no-build-cache`. `--clean` is required after any `app.json` change so the new `versionCode` is picked up.

**Versioning is mandatory on every behavioural change** — bump `package.json` + `app.json` version, increment `versionCode` by exactly 1, add a `CHANGELOG.md` entry. Enforced by `CLAUDE.md` and the `pre-release-check`/`release` skills.

---

## 5. Current State

### Working (validated on the 2026-07-18 12 km run)
- **Coach cadence & reliability** — fired appropriately for the full 77 minutes; all km splits (1–12) and 2-min check-ins present.
- **Cadence accuracy** — 175–185 spm, cross-validated against nRF/Garmin. Trustworthy.
- **Foot-pod BLE stability** — held connection 76 of 77 minutes; one drop near the end with automatic direct-reconnect.
- **Pace accuracy** — 7:35/km average matched Garmin exactly.
- **HR** — accurate (avg 148, max 156 vs Garmin's matching figures).
- **Recalibrate-before-run feature** — works end-to-end (button → BLE write → firmware resets state → 12 s recalibration → countdown in app). Watchdog is paused during recal so it doesn't force a disconnect mid-calibration.

### Fixed in v2.4.3, awaiting on-device confirmation
- **GPS distance over-count** — was 12.14 km vs Garmin's 10.0 km. Gates added. **Must be re-validated against Garmin on the next run**; too-strict gates could under-count in weak-GPS pockets.
- **Ghost coach advice after pod disconnect** — coach was reacting to frozen last-packet values for ~60 s after the pod dropped ("cadence 29!"). All foot-pod-derived triggers now require `fpConnected` + a packet within 5 s.
- **`coachMuted` reset** — muting once had silenced the coach on every subsequent run.
- **BLE monitor-error race** — a late error after a normal disconnect could cancel a re-established connection; now guarded on device identity.

### Fixed in firmware v2.5, awaiting on-device confirmation
- **GCT thresholds** — `MIN_STANCE_MS` 100→220, `GYRO_LIFTOFF` 200→160 °/s (see §6).

---

## 6. Known Issues / Where We Got Stuck

**GCT (ground contact time) is the long-running problem.** The story so far:
- v2.3 and earlier: GCT pinned at ~90 ms (false early exit) or the 600 ms timeout — bimodal, useless.
- v2.4: raised `GYRO_LIFTOFF` 120→200 °/s and added `MIN_STANCE_MS=100`. Better, still bimodal.
- 2026-07-18 run analysis: **76% of running GCTs still pinned at the 100 ms floor**, ~20% in a plausible 300–390 ms cluster. Diagnosis: the ankle's post-landing dorsiflexion transient briefly crosses even 200 °/s, causing a false toe-off the instant the floor allows it.
- v2.5 (current, **unvalidated**): `MIN_STANCE_MS`→220 to bridge the transient, `GYRO_LIFTOFF`→160 to catch the true toe-off crisply. **Next run must confirm** the distribution collapses to a single 300–390 ms cluster. Known caveat: a 220 ms floor will *clip* true GCT at fast race pace (<240 ms contact) — acceptable for easy/tempo, revisit before racing.
- **What we can't get from nRF Connect:** the per-step `[GCT] exit settle_min=… stance_peak=… exit=… dur=…` diagnostic lines are Serial-over-USB only. nRF shows only the 1 Hz broadcast value. For distribution checks nRF/CSV is enough; for debugging *why* a step is wrong, you need USB Serial.

**Overpronation may over-trigger** (B12). 40+ overpronation cues in one run. Could be genuine (Girish may overpronate) or `PRON_OVER_DEG=8°` too tight. Blocked on B7 — needs slow-motion video from behind to ground-truth. Same unknown for foot-strike (side video) and impact G (drop test / video), B6/B7.

**Firmware still broadcasts stale metrics after the runner stops** (B11, firmware half). The app now ignores them (packet-freshness gate), so this is low urgency, but the pod should zero `lastCad` after >3 s with no step.

**Environment friction that recurs:** on Windows the user repeatedly hits stuck-merge / vim / swap-file states during `git pull`. Playbook that works: `git merge --abort` for an unfinished merge; in vim press **Esc** then `:wq`; for a swap-file prompt press **E** (edit anyway) then save. If a pull is blocked by local changes to a version file the user didn't mean to keep, `git checkout <file>` then pull.

---

## 7. How to Pick Up From Here

1. **Next run is the key validation run.** It simultaneously tests firmware v2.5 (GCT) and app v2.4.3 (distance). After it, collect: the coach CSV, the debug log, and a Garmin screenshot. Re-run the GCT histogram (group the `gct` column into <100 / 100–140 / 150–240 / 250–290 / 300–390 / 400–590 / 600 buckets, filtered to cadence ≥ 165) and compare PaceAI total distance to Garmin.
2. **Confirm firmware version on flash** via Serial: banner should read `v2.5` and `GCT settle/liftoff: 50 / 160 deg/s`.
3. **Backlog is the source of truth for open work** — `BACKLOG.md`, items B3–B12. `CLAUDE.md` has the mandatory build/versioning rules and exact Windows Gradle commands.
4. **Session history** is stored locally under `~/.claude/projects/<project-hash>/*.jsonl` — one JSON-line file per session. To reconstruct "what we tried and why", read those transcripts; the compaction summaries near the top of each are the fastest way in. This document is the distilled version of that history.

### Repo map
```
CLAUDE.md            Build + versioning rules (MANDATORY), Windows Gradle steps
BACKLOG.md           Cross-session open items (B3–B12) and Done log (D1–D8)
PROJECT_CONTEXT.md   This file
native/              React Native app (Expo SDK 52)
  src/store/runStore.ts        single Zustand store
  src/services/bleService.ts   BLE scan/connect/parse/recalibrate
  src/services/aiCoach.ts      trigger logic + Claude call + TTS
  src/hooks/useGPS.ts          background GPS + tick()
  src/algorithms/              gps, fatigue, hrZone (pure fns)
  CHANGELOG.md                 per-release detail
firmware/PaceAI_FootPod_v2/PaceAI_FootPod_v2.ino   ESP32 sketch (v2.5)
.claude/skills/      firmware-flash-checklist, code-review, release, etc.
```
