# PaceAI — Backlog

Last updated: 2026-06-23

Items are added here as they are identified across sessions.
When an item is fixed, move it to the Done section with the version it shipped in.

---

## 🔴 High — Correctness Bugs

| ID | Item | File | Notes |
|---|---|---|---|
| B1 | `coachMuted` not reset in `startRun()` | `native/src/store/runStore.ts:211` | One-line fix: add `coachMuted: false` to startRun() set() call. Causes silent coach on all runs after first mute. Root cause of 92-minute run with zero coach events. |
| B2 | BLE monitor error → `cancelConnection()` race | `native/src/services/bleService.ts:222` | Remove `cancelConnection()` from monitor error handler — let `onDisconnected` handle cleanup naturally. |
| B3 | No scan fallback after repeated direct reconnect failures | `native/src/services/bleService.ts:316` | After 3 failed direct reconnects, fall back to `startScan()`. Currently retries direct connect indefinitely. |

---

## 🟡 Medium — Reliability / Accuracy

| ID | Item | File | Notes |
|---|---|---|---|
| B4 | BLE scan uses `device.name` filter instead of service UUID | `native/src/services/bleService.ts:113` | Replace `device.name === FOOT_POD_NAME` with service UUID match for first-pairing scan. Some Android versions suppress name in scan response. |
| B5 | GCT threshold validation and tuning | Firmware | **Validated 2026-07-18 (12 km run, 178 spm):** 76% of running GCTs pinned at the 100 ms `MIN_STANCE_MS` floor (false early exits), 20% at 300–390 ms (likely real). `GYRO_LIFTOFF=200°/s` still too low — dorsiflexion transient crosses it. **Next: raise `MIN_STANCE_MS` to 220 ms, lower `GYRO_LIFTOFF` to 160°/s**, re-validate expecting a single 300–390 ms cluster. |
| B6 | Impact G validation | Firmware + nRF | Cross-validate impact readings against a reference method (known drop height or slow-mo video frame analysis). |
| B7 | Strike / pronation validation | Firmware + nRF | Validate strike classification with slow-motion video from the side; pronation with slow-motion from behind. |

---

## 🟢 Low — Enhancements

| ID | Item | File | Notes |
|---|---|---|---|
| B8 | OLED SSD1306 0.96" display | Firmware | I2C, shares SDA(GPIO21)/SCL(GPIO22) with MPU6050, address 0x3C. Hardware not yet ordered. |
| B9 | Battery voltage readout | Firmware | 2× 100kΩ resistors voltage divider on GPIO35. Hardware not yet ordered. Add ADC read, Serial output, and BLE broadcast. |
| B10 | `peakFatigue` tracking | `native/src/store/runStore.ts` | Track actual peak fatigue during the run separately from current fatigue, for use in post-run DoneScreen summary. |
| B11 | Stale metrics broadcast after stopping | Firmware | Pod keeps broadcasting the last computed cad/gct/impact forever after steps stop (2026-07-18 run: `cad=29, gct=600` frozen for the final minute, generating bogus low_cad/high_fat coach events during cool-down). Fix: zero `lastCad` (and optionally lastGCT/lastImpact) when no step for >3 s. |
| B12 | Overpronation may over-trigger | Firmware | 40+ overpronation coach events in the 2026-07-18 run. Either genuine or `PRON_OVER_DEG=8°` is too tight. Blocked on B7 (slow-mo video validation). |

---

## ✅ Done

| ID | Item | Version | Notes |
|---|---|---|---|
| D1 | Distance doubling bug | v2.3.10 | `tick()` called from BackgroundTimer + GPS task both incrementing dist. Fixed with `if (elapsed > s.elapsedSecs)` guard. |
| D2 | GCT false early exit at ~90ms | v2.4 (firmware) | `GYRO_LIFTOFF` raised 120→200°/s, `MIN_STANCE_MS=100` added, per-step Serial diagnostics added. Threshold still under validation (see B5). |
| D3 | Cadence accuracy validated | — | Cross-validated 178–183 spm against nRF data from long run. Accurate. |
| D4 | Hardware stability confirmed | — | ESP32 foot pod held nRF connection for 1.5-hour outdoor run with no drops. Problem is in app BLE code (see B2, B3). |
