# PaceAI — Backlog

Last updated: 2026-07-20

Items are added here as they are identified across sessions.
When an item is fixed, move it to the Done section with the version it shipped in.

---

## 🔴 High — Correctness Bugs

| ID | Item | File | Notes |
|---|---|---|---|
| B15 | Distance gates still ~5% high vs Garmin in dense cover/hills | `native/src/hooks/useGPS.ts` | 2026-08-23 forest run (220 m elevation): Garmin 10.02 km, gated GPS odometer 10.508 km (+4.9%). v2.6.4 made the odometer drive the displayed number (was +7.5% via the `max()` bug); remaining ~5% is GPS scatter the min-step/accuracy gates don't fully catch under canopy + hills. Consider tightening gates or an elevation/3D-aware step, but beware under-counting on clean runs. Needs more paired FIT-vs-debug-log data to tune. |
| B14 | CSV export escaping corrupts `aiResponse` | `native/src/services/storage.ts` (`toCSV`) | `toCSV` uses `JSON.stringify` per field → JSON escaping (`\"`) instead of RFC-4180 CSV (`""`). Any field with a comma or quote (i.e. most `aiResponse` cells) spills across columns and shows `\Girish` / trailing `\""` artifacts. Confirmed in the 2026-07-18 coach log. Affects ALL CSV exports (coach log, per-run, all runs). Fix: proper CSV escaping — wrap each field in `"`, double internal `"`, strip stray control chars. **Deferred to next build per user (2026-07-20).** |

---

## 🟡 Medium — Reliability / Accuracy

| ID | Item | File | Notes |
|---|---|---|---|
| B16 | Offline rule-based coaching fallback | `native/src/services/aiCoach.ts` | Every cue is a live Claude API call, so genuinely no-signal runs get no coaching. NOTE: the recurring "silent after 2 cues" was **NOT** connectivity — it was the mute-kills-coaching + stuck-`isSpeaking` bugs (fixed v2.6.6, see D11). This item remains as a real enhancement for true dead-zone runs: templated cues (low_cad, high_hr, pace, km splits) that speak with no network, LLM upgrading when online. |
| B17 | Debug log "did not show up" on 2026-08-25 run | `native/src/services/debugLogFile.ts` | User reported no debug log for the run. Likely Debug mode was OFF (GPS/FP lines are gated on it) or a share-path issue. NEEDS repro detail: was Debug mode on? empty file, no share dialog, or error? |
| B4 | BLE scan uses `device.name` filter instead of service UUID | `native/src/services/bleService.ts:113` | Replace `device.name === FOOT_POD_NAME` with service UUID match for first-pairing scan. Some Android versions suppress name in scan response. |
| B5 | GCT threshold validation and tuning | Firmware + App | 2026-07-18 run data: 76% of running GCTs pinned at the 100 ms floor (false early exits), 20% at 300–390 ms (likely real). **Two-layer fix, both awaiting a validation run:** (1) firmware v2.5 raised `MIN_STANCE_MS`→220, `GYRO_LIFTOFF`→160°/s; (2) app v2.5.0 added a pace-based plausibility filter (`algorithms/gct.ts`) that rejects GCT physically impossible for the current GPS pace, so bad readings can't reach fatigue/coaching regardless of firmware. Next run: check debug log for `REJECTED` GCT lines and confirm the accepted values cluster ~300–390 ms. Caveats: firmware 220 ms floor clips true GCT at race pace; filter band is generous (±45%) and pace-model is literature-based, may need tightening once we have paired ground truth (a side-by-side commercial-pod run would give that). |
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
| D5 | GPS distance over-count (~20%) | v2.4.3 | PaceAI 12.14 km vs Garmin 10.0 km (2026-07-18). Odometer summed 1 Hz urban jitter. Fixed with distance-specific gates in `useGPS.ts`: 35 m accuracy gate, min step = max(8 m, accuracy/2), 6.5 m/s speed gate. **Garmin FIT cross-check (2026-07-29):** ground truth 10.003 km; PaceAI accurate to ~1% for the first 60 min / 8 km, then the whole +21% accrued in the final ~17 min of slow cool-down → confirms low-speed jitter is the cause. Raw-GPS-fix debug logging added in v2.6.3 to replay/tune gates offline. **Still needs a validation run that includes a slow walk/stop at the end** (that's the only segment that exercises the fix). |
| D6 | `coachMuted` not reset in `startRun()` | v2.4.3 | Was B1. Muting once silenced the coach for all later runs (root cause of the 92-min silent run). |
| D7 | Coach fired on stale foot-pod data | v2.4.3 | App half of B11. All FP-derived triggers now require `fpConnected` + packet within 5 s. Confirmed cause of ghost "cadence 29" advice after the 4612s disconnect on 2026-07-18. |
| D8 | BLE monitor error → `cancelConnection()` race | v2.4.3 | Was B2, confirmed in the 2026-07-18 log. Both FP and HR monitor-error handlers now cancel only if the erroring device is still the live one (guard chosen over full removal so a live-but-broken monitor still recovers — HR has no watchdog). |
| D9 | Distance displayed via `max(pace, gps)` over-count | v2.6.4 | `tick()` took the larger of pace-integrated and GPS odometer, so it could only inflate. Now GPS odometer is primary when fixes are fresh; pace-integration is a moving-only fallback. Proven by Aug-5 treadmill (showed 2.59 km vs odometer's 0.0) and Aug-23 forest (10.77 shown vs Garmin 10.02). Residual ~5% tracked as B15. |
| D10 | No scan fallback after repeated direct reconnects | v2.6.4 | Was B3. After 3 failed direct reconnects, FP and HR now fall back to `startScan()`. Aug-23 pod dropped mid-run, ~20 min of failed direct reconnects, ~3000 steps lost. |
| D11 | Coach silent after ~2 cues (mute + stuck isSpeaking) | v2.6.6 | Root cause of the recurring silence (misattributed to internet). (1) Mute returned early in the coach loop → killed triggering/API/logging, not just audio; now audio-only. (2) A missed TTS finish event left `isSpeaking` stuck true → permanent block; now self-healed after 35s. |
| D12 | Mute let an in-flight cue speak | v2.6.5 | Mute was checked before the 1–2s API call but audio played after; re-checked before speak(). |
