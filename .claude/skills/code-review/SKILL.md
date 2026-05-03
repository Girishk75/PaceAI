---
name: code-review
description: Full PaceAI code review covering native app (TypeScript/React Native) and firmware (ESP32/Arduino). Checks logic correctness, BLE protocol compliance, state management, versioning, and known platform pitfalls. Run before any feature merge or release.
---

# Code Review

PaceAI-specific review covering both the React Native app and the ESP32 firmware.

## Step 1 — Scope the diff

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Identify which layers changed:
- `native/` only → app review
- `firmware/` only → firmware review
- Both → run both reviews

---

## Native App Review (`native/`)

### State management (`native/src/store/runStore.ts`)
- [ ] `tick()` uses wall-clock `Math.round((Date.now() - startTs) / 1000)` — NOT `elapsed + 1`
- [ ] `tick()` is idempotent — safe to call from GPS task AND BackgroundTimer simultaneously
- [ ] No state mutation outside Zustand actions
- [ ] `appendLog` calls `addDebugLine` for persistent file logging
- [ ] `running` flag checked before any state write in time-sensitive paths

### BLE (`native/src/hooks/useBLE.ts`, `native/src/services/bleManager.ts`)
- [ ] Device scan filters by service UUID (`[FOOT_POD_SERVICE]` or `[HR_SERVICE]`) — never by name
- [ ] `bleManager` is a singleton — no double-instantiation
- [ ] Disconnection handler restarts scan or updates UI state
- [ ] No `device.name` filter (ESP32 puts name in scan response, not advertisement)

### GPS / background (`native/src/hooks/useGPS.ts`)
- [ ] `TaskManager.defineTask` calls `store.tick()` on every location update
- [ ] Foreground service started before background task registered
- [ ] Battery optimisation exemption documented in `/run-test`

### Coach / audio
- [ ] Triggers fire from elapsed time derived from wall clock, not a counter
- [ ] No trigger can fire twice (debounce or fired-set check)
- [ ] Coach log entry written via `appendLog` (not console.log)

### Debug log (`native/src/services/debugLogFile.ts`)
- [ ] `initDebugLog(runId)` called at run start
- [ ] `flushDebugLog()` called every 30s via `setInterval`
- [ ] Final `flushDebugLog()` called on screen unmount
- [ ] `shareLastDebugLog()` available from Settings → DEBUG section

### Screens
- [ ] No direct state reads outside hooks (no `useRunStore.getState()` in render)
- [ ] Loading/error states handled at BLE scan entry points
- [ ] Version shown in Settings → ABOUT matches `native/app.json`

### TypeScript
- [ ] No `any` casts on BLE characteristic values — parse explicitly
- [ ] No implicit `undefined` access on optional device fields
- [ ] No `// @ts-ignore` without a comment explaining why

---

## Firmware Review (`firmware/PaceAI_FootPod_v2/PaceAI_FootPod_v2.ino`)

### Calibration
- [ ] `good < 100` path uses defaults and continues to `bleSetup()` — no `while(true)` hang
- [ ] `impactThresh` floored at `MIN_IMPACT_G` (2.0G)
- [ ] `neutralPitch` / `neutralRoll` seeded into CF before main loop

### Sensor math
- [ ] Accel magnitude `sqrt(ax²+ay²+az²)` used for impact — NOT a single axis
- [ ] Gyro offsets subtracted in raw int16 units before scaling (precision preservation)
- [ ] CF alpha = 0.98, DT = 0.01 (matches 100 Hz sample rate)
- [ ] `az_safe` clamp prevents atan2 instability near ±90°

### GCT state machine
- [ ] Three states: `GCT_IDLE → GCT_SETTLING → GCT_STANCE → GCT_IDLE`
- [ ] `MAX_GCT_MS` hard cap on both SETTLING and STANCE timeouts
- [ ] `MIN_GCT_MS` enforced before recording a valid GCT
- [ ] Pronation classified at toe-off (gMag > GYRO_LIFTOFF), not at IC

### BLE
- [ ] TX power set to `ESP_PWR_LVL_N6` (-6 dBm) for all three power types
- [ ] Advertising interval 160–320 (100–200 ms)
- [ ] `onDisconnect` restarts advertising
- [ ] Broadcast format matches app parser: `"cadence,impact,gct,steps,strike,pronation"`
- [ ] `SERVICE_UUID` and `CHARACTERISTIC_UUID` unchanged from app constants

### Safety
- [ ] No `delay()` in the main loop — only in `calibrate()` (blocking is intentional there)
- [ ] No dynamic memory allocation (`new`/`malloc`) after `setup()` completes
- [ ] Serial output limited to 1 Hz BLE broadcast lines in production (no per-sample spam)

---

## Cross-cutting checks

### Versioning (MANDATORY)
- [ ] `native/package.json` version bumped
- [ ] `native/app.json` version bumped (matches package.json)
- [ ] `native/app.json` versionCode incremented by exactly 1
- [ ] `native/CHANGELOG.md` has new entry with today's date

### Protocol compatibility
- [ ] BLE UUIDs unchanged: `SERVICE_UUID` and `CHARACTERISTIC_UUID`
- [ ] BLE broadcast field order unchanged: cadence, impact, gct, steps, strike, pronation
- [ ] Firmware version string in Serial output updated if behaviour changed

---

## Red flags — stop and fix before continuing

| Finding | Action |
|---|---|
| `while(true)` anywhere in firmware outside `calibrate()` | Remove — replace with graceful fallback |
| `device.name` used as scan filter | Replace with service UUID filter |
| `elapsed + 1` in `tick()` | Replace with wall-clock calculation |
| `BackgroundTimer` as sole timer driver | Add GPS task as secondary driver |
| Version bump missing | Cannot release — block the commit |
| TX power not set in `bleSetup()` | Re-add — default +9 dBm breaks battery-only operation |
