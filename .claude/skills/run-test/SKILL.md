---
name: run-test
description: Structured checklist for validating a PaceAI build on a real run. Covers pre-run setup, in-run verification, and post-run log analysis. Use before declaring any build ready.
---

# Run Test Checklist

Use this before declaring any app or firmware build ready. A short 10-minute test run with debug mode on is sufficient.

## Pre-run setup

1. **Enable debug mode** — Settings → DEBUG → Debug overlay ON
2. **Confirm foot pod connects** — green dot next to FOOT POD in Setup screen
3. **Confirm HR connects** — green dot next to HR STRAP in Setup screen
4. **Check app version** — Settings → ABOUT → should match expected version
5. **Charge phone to >50%** — long runs drain battery faster with GPS + BLE active
6. **Battery-exempt PaceAI** — Android Settings → Battery → Battery Optimization → PaceAI → Don't optimize

## Run setup in app

- Run type: **Easy**
- Target distance: **2 km** (short enough to complete quickly)
- Target pace: **0** (no target, avoid pace triggers masking other issues)
- Weather: whatever is accurate

## During the run

- Put phone in **pocket with screen locked** after 30 seconds — this is the critical test condition (screen-off = Android can throttle the app)
- Run for at least **5 minutes** before checking

## What to verify mid-run (glance at debug overlay)

| Check | Expected |
|---|---|
| Elapsed time advancing | Yes — if frozen, timer bug |
| FP dot green | Yes — if grey, pod disconnected |
| HR dot green | Yes — if grey, HR strap disconnected |
| Cadence > 0 | Yes — if 0, pod not sending data |
| Coach speaks at ~2min | Yes — 2min_checkin trigger |

## Post-run log analysis

After the run, go to **Settings → DEBUG → SHARE LAST DEBUG LOG** and check:

**Minimum expected log entries for a 5-minute run:**
- `run_start` at ~3s ✓
- `2min_checkin` at ~120s ✓ (if missing → timer was frozen)
- At least one km milestone or other trigger ✓

**BLE log lines to check:**
```
[BLE] scan started          → scanning worked
[BLE] FP connected ✓        → foot pod connected
[BLE] HR connected ✓        → HR strap connected
[FP]  cad=XXX               → data flowing from pod
```

**Red flags in log:**
| Log line | Problem |
|---|---|
| Only 1 coach entry (run_start) for whole run | Timer froze — screen lock killed BackgroundTimer |
| `FP disconnected` repeated 3-4× in quick succession | Android GATT duplicate callback (should be fixed in v2.3.1) |
| `FP retry in 30s` appearing frequently | Pod dropping connection mid-run |
| No `[FP]` data lines | Pod connected but not sending data |
| `scan error:` | Bluetooth permission or state issue |

## Pass criteria

A build passes run-test when:
- [ ] Elapsed time advances correctly with screen locked
- [ ] Coach fires at least one cue after the 2-minute mark
- [ ] Foot pod stays connected for the full run (or reconnects within 30s if it drops)
- [ ] Debug log has entries throughout the run, not just at the start
- [ ] No crashes or freezes

## If the test fails

Share the debug log (Settings → SHARE LAST DEBUG LOG) — do not attempt to diagnose from memory. The log has timestamps, BLE events, and coach trigger history that pinpoint the issue.
