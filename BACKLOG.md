# PaceAI — Backlog

Last updated: 2026-07-20

Items are added here as they are identified across sessions.
When an item is fixed, move it to the Done section with the version it shipped in.

---

## 🔴 High — Correctness Bugs

| ID | Item | File | Notes |
|---|---|---|---|
| B3 | No scan fallback after repeated direct reconnect failures | `native/src/services/bleService.ts:316` | After 3 failed direct reconnects, fall back to `startScan()`. Currently retries direct connect indefinitely. |

---

## 🟡 Medium — Reliability / Accuracy

| ID | Item | File | Notes |
|---|---|---|---|
| B4 | BLE scan uses `device.name` filter instead of service UUID | `native/src/services/bleService.ts:113` | Replace `device.name === FOOT_POD_NAME` with service UUID match for first-pairing scan. Some Android versions suppress name in scan response. |
| B5 | GCT threshold validation and tuning | Firmware | 2026-07-18 run data: 76% of running GCTs pinned at the 100 ms floor (false early exits), 20% at 300–390 ms (likely real). **Fix applied in firmware v2.5** (`MIN_STANCE_MS=220`, `GYRO_LIFTOFF=160°/s`) — awaiting re-validation run, expecting a single 300–390 ms cluster. Caveat: 220 ms floor clips true GCT at race pace. |
| B6 | Impact G validation | Firmware + nRF | Cross-validate impact readings against a reference method (known drop height or slow-mo video frame analysis). |
| B7 | Strike / pronation validation | Firmware + nRF | Validate strike classification with slow-motion video from the side; pronation with slow-motion from behind. |

---

## 🟢 Low — Enhancements

| ID | Item | File | Notes |
|---|---|---|---|
| B8 | OLED SSD1306 0.96" display | Firmware | I2C, shares SDA(GPIO21)/SCL(GPIO22) with MPU6050, address 0x3C. Hardware not yet ordered. |
| B9 | Battery voltage readout | Firmware | 2× 100kΩ resistors voltage divider on GPIO35. Hardware not yet ordered. Add ADC read, Serial output, and BLE broadcast. |
| B10 | `peakFatigue` tracking | `native/src/store/runStore.ts` | Track actual peak fatigue during the run separately from current fatigue, for use in post-run DoneScreen summary. |
| B11 | Firmware broadcasts stale metrics after stopping | Firmware | Remaining half of the stale-data issue (app half shipped in v2.4.3, see D7): pod broadcasts the last computed cad/gct/impact forever after steps stop; zero `lastCad` when no step for >3 s. Low urgency now that the coach gates on packet freshness. |
| B12 | Overpronation may over-trigger | Firmware | 40+ overpronation coach events in the 2026-07-18 run. Either genuine or `PRON_OVER_DEG=8°` is too tight. Blocked on B7 (slow-mo video validation). |

---

## ✅ Done

| ID | Item | Version | Notes |
|---|---|---|---|
| D1 | Distance doubling bug | v2.3.10 | `tick()` called from BackgroundTimer + GPS task both incrementing dist. Fixed with `if (elapsed > s.elapsedSecs)` guard. |
| D2 | GCT false early exit at ~90ms | v2.4 (firmware) | `GYRO_LIFTOFF` raised 120→200°/s, `MIN_STANCE_MS=100` added, per-step Serial diagnostics added. Threshold still under validation (see B5). |
| D3 | Cadence accuracy validated | — | Cross-validated 178–183 spm against nRF data from long run. Accurate. |
| D4 | Hardware stability confirmed | — | ESP32 foot pod held nRF connection for 1.5-hour outdoor run with no drops. Problem is in app BLE code (see B3). |
| D5 | GPS distance over-count (~20%) | v2.4.3 | PaceAI 12.14 km vs Garmin 10.0 km (2026-07-18). Odometer summed 1 Hz urban jitter. Fixed with distance-specific gates in `useGPS.ts`: 35 m accuracy gate, min step = max(8 m, accuracy/2), 6.5 m/s speed gate. **Needs validation vs Garmin on next run.** |
| D6 | `coachMuted` not reset in `startRun()` | v2.4.3 | Was B1. Muting once silenced the coach for all later runs (root cause of the 92-min silent run). |
| D7 | Coach fired on stale foot-pod data | v2.4.3 | App half of B11. All FP-derived triggers now require `fpConnected` + packet within 5 s. Confirmed cause of ghost "cadence 29" advice after the 4612s disconnect on 2026-07-18. |
| D8 | BLE monitor error → `cancelConnection()` race | v2.4.3 | Was B2, confirmed in the 2026-07-18 log. Both FP and HR monitor-error handlers now cancel only if the erroring device is still the live one (guard chosen over full removal so a live-but-broken monitor still recovers — HR has no watchdog). |
