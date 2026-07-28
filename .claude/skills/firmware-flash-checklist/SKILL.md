---
name: firmware-flash-checklist
description: Use after every firmware change to verify the flash process and confirm correct Serial Monitor output. Covers pull, Arduino IDE flash, Serial verification, and Android APK build steps.
---

# Firmware Flash Checklist

Run this after every change to `firmware/PaceAI_FootPod_v2/PaceAI_FootPod_v2.ino`.

## Step 1 — Pull latest on Windows

```powershell
cd C:\Users\Administrator\PaceAI
git branch --show-current
#   must be claude/build-paceai-coach-N3M2x — the latest firmware lives on the
#   branch, NOT on main. If it says main:
#     git checkout -- native/package.json
#     git checkout claude/build-paceai-coach-N3M2x
git pull origin claude/build-paceai-coach-N3M2x
```

Confirm the firmware file updated (close and reopen it in Arduino IDE — it caches):
```
C:\Users\Administrator\PaceAI\firmware\PaceAI_FootPod_v2\PaceAI_FootPod_v2.ino
```

**Git recovery — always try these if a pull/checkout is blocked:**

| Symptom | Fix |
|---|---|
| `local changes to native/package.json would be overwritten` (prebuild rewrites it every build) | `git checkout -- native/package.json` then re-run |
| `unfinished merge (MERGE_HEAD exists)` | `git merge --abort` then re-pull |
| stuck in vim | **Esc**, then `:wq`, then **Enter** |
| swap-file prompt (`.swp`) | press **E**, then save |
| file still shows old version | you are on `main` — checkout the branch above; reopen the file in the editor |

## Step 2 — Flash via Arduino IDE

1. Open `PaceAI_FootPod_v2.ino` in Arduino IDE
2. Board: **ESP32 Dev Module** (or your specific board)
3. Port: whichever COM port the ESP32 is on
4. Upload → wait for "Done uploading"

## Step 3 — Open Serial Monitor

- Baud rate: **115200**
- Watch for the calibration sequence

## Step 4 — Verify Serial output

**Hold the pod still during calibration.**

Expected output (good calibration):
```
PaceAI vX.X — hold pod still for ~12 seconds...
  0%  10%  20%  30%  40%  50%  60%  70%  80%  90%
Calibration complete
  Baseline : ~1.000 G  (σ = small value)
  Threshold: X.XXX G  (exit: X.XXX G)
  Gyro off : X / X / X  (raw units)
  Neutral  : pitch X.X°  roll X.X°
PaceAI FootPod vX.X — advertising
Impact threshold: X.XXX G  |  GCT settle/liftoff: X / X deg/s
```

The version and threshold numbers will vary — what matters is that all lines appear and there is no `WARNING` line.

Then 1 Hz broadcast lines:
```
[BLE] cad=0  imp=0.00G  gct=0ms  steps=0  str=-1  pro=-1  conn=0
```

**Watch for these problems:**

| What you see | What it means |
|---|---|
| `WARNING: poor calibration` | Power/I2C issue — pod will still advertise in degraded mode |
| LED blinking rapidly, no Serial output | Flash failed — retry |
| `conn=0` stays after app connects | BLE not connecting — check TX power, check app scan |
| `conn=1` appears | App connected ✓ |
| Cadence/steps stay 0 while walking | Sensor issue or threshold too high |

## Step 5 — Confirm BLE advertising (battery only)

1. Unplug USB/charger
2. Power cycle the pod
3. Wait 15 seconds (calibration)
4. Open nRF Connect — confirm **PaceAI-FootPod** appears in scan
5. Open app Settings → SCAN FOR DEVICES → confirm pod appears

## Step 6 — Walk test

Strap pod to ankle, walk 20 steps, confirm in Serial Monitor:
- `cad` > 0
- `steps` incrementing
- `imp` > 0
- `conn=1` once app connects

## Step 7 — Build and install Android APK

Run these commands on Windows (always use Gradle — never EAS):

```powershell
# Ensure latest code on the dev branch first (prebuild rewrites package.json,
# which blocks the next pull — discard it if git complains):
cd C:\Users\Administrator\PaceAI
git checkout -- native/package.json   # only if a pull is blocked
git pull origin claude/build-paceai-coach-N3M2x

# Regenerate native Android folder (required after any app.json/versionCode change)
cd C:\Users\Administrator\PaceAI\native
npx expo prebuild --platform android --clean

# Build the APK
cd android
gradlew assembleRelease --rerun-tasks --no-build-cache
```

See the Git recovery table in Step 1 for other blocked-pull symptoms.

APK output:
```
C:\Users\Administrator\PaceAI\native\android\app\build\outputs\apk\release\app-release.apk
```

Transfer to phone and install. If Android blocks install, enable **Install from unknown sources** in phone settings.

## Known issues / gotchas

- **Neutral pitch ~178°** — pod is mounted with sensor board facing down; this is normal, delta-based strike/pronation still works
- **Threshold floors at 2.0G** — expected when baseline < ~1.1G; impact detection works at this threshold
- **Pod only connects with charger** — was a TX power issue, fixed in firmware by reducing to -6 dBm
- **12-second delay before advertising** — calibration must complete first; this is by design
