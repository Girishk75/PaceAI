# PaceAI — Claude Code Project Brief
**Version:** Based on Specification v9.3 | **Date:** April 2026 | **Developer:** Girish, Mumbai

---

## What Is This Project?

PaceAI is a DIY AI-powered real-time running coach built as a single-file Progressive Web App (PWA). It connects to a custom-built ESP32 Bluetooth foot pod and a Garmin FR245 heart rate monitor, reads phone GPS, and delivers live spoken coaching through earphones via the Claude Sonnet API.

**Live app:** https://girishk75.github.io/Pace  
**Tech:** Single HTML file — Vanilla JS + CSS, no frameworks  
**Hosting:** GitHub Pages

---

## Hardware Stack

### ESP32 Foot Pod (custom-built)
- Microcontroller: ESP32 DevKit + MPU6050 accelerometer/gyroscope
- Power: LiPo 500mAh + TP4056 charger + slide switch
- BLE Name: `PaceAI-FootPod`
- Service UUID: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- Characteristic UUID: `beb5483e-36e1-4688-b7f5-ea07361b26a8`
- Data format: CSV string — `"cadence,impact,gct,steps"`
- Broadcast: every 1 second at 100Hz sampling
- Mounting: ankle under sock (single foot — app doubles cadence for both feet)

### Garmin FR245
- Standard BLE heart_rate service / heart_rate_measurement characteristic
- Virtual Run mode required for BLE broadcast
- Confirmed working — avg match within 1–3bpm

### Phone GPS
- Uses `watchPosition()` + `getCurrentPosition()` pre-warm
- Sliding 5-position haversine window for pace smoothing
- Pace bounds: 3:30–15:00/km (210–900 secs/km)
- Accuracy threshold: 150m (relaxed for Mumbai urban)
- Minimum movement between fixes: 3m
- Staleness: gpsPace flagged stale after 15 seconds without update → falls back to simulated pace

---

## App Stack

| Property | Value |
|---|---|
| Type | Single HTML file PWA |
| Framework | Vanilla JavaScript + CSS |
| BLE | Web Bluetooth API |
| GPS | Geolocation API |
| Voice | Web Speech API (rate 0.92, pitch 1.0, vol 1.0) |
| Storage | localStorage (runs, coach log, API key) |
| AI | Claude Sonnet API — `claude-sonnet-4-20250514` |
| Screen Lock | Wake Lock API |

---

## App Screens

1. **Setup** — configure run, connect BLE devices, view history
2. **Live Run** — real-time metrics display
3. **Run Shield** — fullscreen tap-lock overlay (auto-engages 3s after start, hold 2s to unlock)
4. **Paused** — pause state with resume/end options
5. **Done** — post-run summary + export buttons
6. **History** — all runs with CSV export
7. **Settings** — API key management

---

## Live Metrics Displayed

- Elapsed time (large clock)
- Distance (km)
- Pace (min/km)
- Heart rate + HR Zone (Z1–Z5) with animated zone strip
- Cadence (spm — doubled from single foot pod)
- Steps (total, offset-corrected per run)
- Impact G (force per footstrike)
- Ground Contact Time (milliseconds)
- Composite Fatigue Index (0–10 scale)
- Fatigue breakdown: HR drift, cadence, GCT, impact components
- Live predictions: estimated finish, remaining distance, avg pace, HR%, fatigue risk

When hardware is not connected, every metric shows a simulation indicator (e.g. ⚡ SIM PACE, ⚡ Sim HR, ⚡ Simulated).

---

## Key Algorithms

### Fatigue Index (0–10)
```
HR component:      max(0, (HR - 143) / 20) × 3.5
Cadence component: max(0, 172 - cadence) × 0.6   [only after 30s elapsed]
GCT component:     max(0, GCT - 245) × 0.05
Impact component:  max(0, impact - 2.1) × 4

Composite = HR×0.35 + Cadence×0.25 + GCT×0.20 + Impact×0.20
```
Note: Cadence fatigue is zero for first 30s to prevent phantom fatigue from stationary foot pod.

### GPS Distance Accumulation
```
Every tick (1 second):
  S.dist += 1 / gpsPace          // accumulate each second
  if gpsDist > S.dist: S.dist = gpsDist   // sync when GPS jumps ahead
  Never goes backwards
First fix: if gpsDist=0 and S.dist>0: gpsDist = S.dist  // no reset
```

### Cadence (Foot Pod)
```
BLE handler: if(cad > 0 && cad < 200) fpCadence = cad × 2
```
Pod is single-ankle → raw value is one-foot cadence → doubled for total.

### Step Offset Correction
```
At run start: fpStepsOffset = fpSteps (current ESP32 cumulative count)
Each tick:    S.steps = max(0, fpSteps - fpStepsOffset)
If foot pod connects after run start: offset set on first BLE packet
```

### HR Zones (Max HR: 185bpm)
| Zone | Range | Category |
|---|---|---|
| Z1 | < 111bpm | Recovery |
| Z2 | 111–130bpm | Aerobic |
| Z3 | 130–148bpm | Tempo |
| Z4 | 148–167bpm | Threshold |
| Z5 | > 167bpm | Max |

### GPS Pace Staleness
```
gpsPaceTime recorded on each gpsPace update
In tick(): gpsPaceStale = gpsPace > 0 && (now - gpsPaceTime) > 15000
If stale: fall back to simPace(), show ⚡ SIM PACE
```

---

## AI Coaching

### Trigger Events
| Trigger | Condition |
|---|---|
| Run start | 3 seconds after tapping Start |
| 2-min check-in | Every 120 seconds elapsed |
| km milestone | Each km completed |
| HR Zone 4 entry | First time HR crosses into Z4 |
| HR Zone 5 | Every 30 seconds in Z5 |
| Pace too slow | >20s/km behind target, every 75s |
| Pace too fast | >20s/km ahead of target, every 75s |
| Low cadence | Below 165spm, every 60s |
| High impact | Above 2.8G, every 90s |
| High fatigue | Fatigue index above 7/10, every 60s |

### Prompt Context (per AI call)
- Trigger reason
- Distance covered and remaining
- Elapsed time
- Current pace vs target pace (diff in seconds)
- HR, HR zone, % of max HR
- Cadence, GCT, impact force
- Composite fatigue + all four components
- Run type (easy/tempo/long/race/intervals)
- Weather condition
- Full runner profile (see below)

---

## Runner Profile (Embedded in AI Prompts)
| Attribute | Value |
|---|---|
| Name | Girish |
| Location | Mumbai, India |
| Total Runs | 323 on Garmin |
| Total Distance | 3,043 km |
| Longest Run | Full Marathon (Jan 2026) |
| Max HR | 185 bpm |
| Resting HR | 65 bpm |
| Baseline Cadence | 172 spm |
| Baseline GCT | 245 ms |
| Baseline Impact | 2.1 G |
| Conditions | Warm & humid (Mumbai mornings) |
| Watch | Garmin Forerunner 245 |

---

## Coach Log (Cross-Run Persistent Database)

Stored in localStorage under key: `paceai_coach_log_v1`

Every AI coaching response is logged with 23 fields:

| Category | Fields |
|---|---|
| Identity | runId, runDate, runTime |
| Config | runType, weather, targetDist, targetPace |
| Trigger | trigger, adviceType |
| State | elapsedSecs, elapsedDisplay, distKm |
| Pace | paceDisplay, paceDiffSecs |
| Biometrics | hr, hrZone, cadence, gct, impact |
| Fatigue | fatigueTotal, fatigueHR, fatigueCad, fatigueGCT, fatigueImp |
| Coaching | aiResponse |

**Exports available:** Coach Log CSV, This Run CSV, All Runs CSV

---

## Known Issues & Limitations

1. **Screen lock kills app timer** — Android Doze suspends setInterval when screen locks. Wake Lock only prevents auto-dimming, not manual power button. *Workaround: 30min screen timeout + Run Shield.*

2. **System gestures bypass Run Shield** — Android swipe-down, edge gestures, volume buttons cannot be intercepted in Chrome PWA.

3. **GCT always 410ms (93% of readings)** — Current firmware threshold-based detection fires the 400ms safety timeout on nearly every footstrike. Fix: Firmware v2.0 (planned).

4. **GPS pace ±45s/km vs Garmin** — Mumbai urban GPS conditions. Acceptable for coaching, cadence and HR are accurate.

5. **Distance capture ~51%** — App stops accumulating when screen locks mid-run.

---

## Current Version History

| Version | Key Changes |
|---|---|
| v7.0 | Ground-up rewrite — fixed position:fixed click-blocking |
| v7.2 | Coaching log (23 fields, cross-run) |
| v7.3 | GPS distance/pace calculation fixed |
| v7.4 | Foot pod BLE integration, step offset correction |
| v8.0 | GPS pre-warm, all metrics sim indicators |
| v8.2 | GPS staleness detection, accuracy/movement thresholds |
| v9.0 | Run Shield (hold 2s to unlock) |
| v9.1 | Lock button in live header |
| v9.2 | API key to localStorage, cadence ×2 fix |
| v9.3 | Current stable version |

---

## Roadmap / What to Build Next

### Immediate — Firmware v2.0 (ESP32 C code)
- ±8G accelerometer range (prevents signal clipping — currently clips at 3.08G peaks)
- ±2000°/s gyroscope range (enables Terminal Contact detection)
- DLPF setting 3 (44Hz) — removes vibration noise, keeps impact spikes
- Static calibration (1000 samples at power-on) — auto-set dynamic threshold
- Complementary filter — stable orientation from accel + gyro fusion
- Peak detection on squared acceleration signal
- Gyroscope-based Terminal Contact detection for accurate GCT
- New impact threshold: 2.4G minimum peak (based on benchmark: still=1.48G avg, running=2.61G avg)

### Near Term — App Improvements
- Battery voltage indicator (requires 2× resistor voltage divider on GPIO34)
- Battery time estimator (time-based until resistors arrive)

### Major — React Native App
- Solves screen lock: Android ForegroundService keeps timer alive
- Solves system gestures: kiosk/lock-task mode
- Full background GPS and BLE (no browser limitations)
- Same BLE UUIDs and data format — foot pod firmware unchanged
- Same Claude AI coaching logic — ported from JS
- Coach log and run history via AsyncStorage

### Post-Run AI Analysis
- Feed entire coach log to Claude after run
- Pattern recognition across multiple runs
- Personalised training recommendations from longitudinal data
- Fatigue signature identification

---

## Instructions for Claude Code

The app currently lives as a single HTML file. When working on it:

1. **Respect the single-file constraint** unless explicitly asked to refactor to React Native.
2. **Do not change BLE UUIDs** — hardware is already deployed.
3. **Preserve the coach log schema** (23 fields, localStorage key `paceai_coach_log_v1`) — changing it breaks historical data.
4. **Simulation mode must remain** — all metrics fall back gracefully when hardware not connected.
5. **The runner profile values are real** — do not use placeholder data in AI prompts.
6. **Test edge cases:** GPS staleness, BLE disconnect mid-run, foot pod connecting after run start.
7. When building Firmware v2.0, use Arduino/ESP32 Arduino framework — same as v1.1.
