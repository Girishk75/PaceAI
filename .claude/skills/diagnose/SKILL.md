---
name: diagnose
description: Multi-symptom diagnosis for PaceAI. Collects all symptoms, splits them into independent parallel subagents (one per symptom category), and synthesises findings into a ranked root-cause list. Use when the run fails, the pod misbehaves, or the app crashes and you have more than one thing wrong at once.
---

# Diagnosis

Use when you have two or more unexplained symptoms. The goal is to avoid chasing one symptom while missing a deeper shared root cause.

## Step 1 — Collect all symptoms before touching any code

List every abnormal observation:
- What the user reported ("coach didn't speak", "pod didn't connect")
- What the debug log shows (share via Settings → DEBUG → SHARE LAST DEBUG LOG)
- What the Serial Monitor shows (if firmware is involved)
- What Garmin / another watch recorded (ground truth for pace/distance)

**Do not form a hypothesis yet.**

## Step 2 — Categorise symptoms by system

| Category | Symptoms that belong here |
|---|---|
| **BLE** | Pod not showing in scan, pod connects with charger only, `conn=0` in Serial, pod drops mid-run |
| **Timer** | Elapsed time frozen, coach only fires at run_start, timer advances when screen on but not off |
| **Sensor / IMU** | Cadence = 0 while running, impact always 0.00G, GCT always 0ms, strike always -1 |
| **GPS** | Distance wildly off, pace spikes, background task not firing |
| **Coach / audio** | Silent run, wrong cue, cue fires at wrong time, cue fires twice |
| **Firmware** | Calibration hang (blinking LED, no BLE), degraded mode warning in Serial |
| **App crash** | App closes mid-run, no post-run log available |

## Step 3 — Spawn one subagent per category with symptoms

For each category that has at least one symptom, dispatch a parallel subagent:

**Agent prompt template:**
```
PaceAI diagnosis — [CATEGORY] symptoms

Symptoms reported:
- [list symptoms]

Relevant files to read:
- [file list for this category — see table below]

Task:
1. Read the relevant files.
2. Identify the most likely root cause for each symptom.
3. Rate confidence: HIGH / MEDIUM / LOW.
4. Identify if symptoms share a root cause or are independent.
5. Suggest the minimal code or hardware change to fix it.

Report in under 300 words.
```

**File map by category:**

| Category | Files to read |
|---|---|
| BLE (app side) | `native/src/hooks/useBLE.ts`, `native/src/screens/SettingsScreen.tsx`, `native/src/services/bleManager.ts` |
| BLE (firmware) | `firmware/PaceAI_FootPod_v2/PaceAI_FootPod_v2.ino` — bleSetup(), BLECBs |
| Timer | `native/src/store/runStore.ts` — tick(), `native/src/hooks/useGPS.ts` — TaskManager task |
| Sensor / IMU | `firmware/PaceAI_FootPod_v2/PaceAI_FootPod_v2.ino` — calibrate(), processSample() |
| GPS | `native/src/hooks/useGPS.ts` |
| Coach | `native/src/store/runStore.ts` — coach trigger logic, `native/src/screens/LiveRunScreen.tsx` |
| Debug log | `native/src/services/debugLogFile.ts`, `native/src/store/runStore.ts` — appendLog |

## Step 4 — Synthesise findings

After all subagents report:
1. List all hypothesised root causes.
2. Look for a single cause that explains multiple symptoms — prioritise that.
3. Rank: most → least confidence.
4. Present to user before writing any code.

## Step 5 — Confirm before fixing

State each root cause and proposed fix. Ask: "Does this match what you observed?"

**Do not write code until the user confirms the diagnosis.**

## Known shared root causes in PaceAI

| Symptoms together | Likely single cause |
|---|---|
| Timer frozen + coach silent after screen lock | Android Doze killed BackgroundTimer — GPS task not driving tick() |
| Pod not in nRF + pod not in app scan | BLE never started — calibration hang or TX power voltage sag |
| Pod in nRF + not in app scan | App scan filtering by name (bug) — should filter by service UUID |
| Calibration blinks then nothing | `while(true)` hang on poor I2C — poor power supply |
| Pod only works with charger | BLE TX power too high (default +9 dBm) — causes LiPo voltage sag |
| Steps = 0 + impact = 0 | `impactThresh` set too high — or I2C failure returning zero accel |
