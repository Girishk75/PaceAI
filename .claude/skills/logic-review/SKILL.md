---
name: logic-review
description: Deep correctness audit of PaceAI algorithms — firmware sensor math, state machines, and app-side arithmetic. Checks for edge cases, unreachable code, floating-point hazards, integer overflow, and classification logic gaps. Run when implementing or changing any sensor algorithm, timer logic, or classification function.
---

# Logic Review

A correctness audit — not a style review. Every check here is about whether the code produces the right number or the right state, not whether it looks clean.

## Scope — what to review

Pass one of:
- A specific function name (`calibrate`, `processSample`, `tick`, `dominantStrike`)
- A file (`runStore.ts`, `PaceAI_FootPod_v2.ino`)
- A concept ("the GCT state machine", "the cadence calculation")

---

## Firmware logic (`PaceAI_FootPod_v2.ino`)

### Calibration (`calibrate()`)
- [ ] `good` counter only increments on successful I2C read — bad reads excluded from statistics
- [ ] `sumMagSq` uses `double` not `float` — avoids precision loss over 1000 samples
- [ ] `variance = sumMagSq/good - baseline²` — numerically stable only when baseline ≈ 1.0; flag if baseline deviates >20%
- [ ] `margin = max(4σ, 0.4 × baseline)` — both terms evaluated; neither dominates silently
- [ ] `impactThresh = max(baseline + margin, MIN_IMPACT_G)` — floor always applied
- [ ] `neutralPitch / neutralRoll` averaged from post-gyro-offset samples only (200 samples after main loop)
- [ ] `cfPitch = neutralPitch` seeds CF correctly — not 0.0

### Impact detection (`processSample()` — strike section)
- [ ] Entry condition: `aMag >= impactThresh AND (now - lastStepMs) >= MIN_STEP_MS`
- [ ] Refractory period `MIN_STEP_MS = 220ms` — equivalent to 272 spm max; still physiologically valid?
- [ ] `peakG` tracked inside strike (above `exitThresh`) — not a one-shot peak at IC
- [ ] Exit condition: `aMag < exitThresh` where `exitThresh = impactThresh × IMPACT_EXIT_R (0.75)` — hysteresis correct direction (exit < entry)
- [ ] `totalSteps` incremented at exit, not at entry — correct (step counted when complete)

### Cadence
- [ ] Rolling buffer `CAD_BUF = 6` — read backwards from `cadIdx` correctly (modular arithmetic)
- [ ] `lastCad = 60000 / mean_interval_ms` — units correct (spm from ms interval)
- [ ] Guard: `lastStepMs > 0` before computing interval (first step has no predecessor)
- [ ] `cadCount` capped at `CAD_BUF` before mean — no reading uninitialised entries

### GCT state machine
- [ ] Transitions: `IDLE → SETTLING` at IC, `SETTLING → STANCE` when `gMag < GYRO_SETTLE`, `STANCE → IDLE` at toe-off or timeout
- [ ] No transition `SETTLING → IDLE` except on timeout — pod stays in SETTLING until settled or timed out
- [ ] `gctStart` set at IC (not at SETTLING entry) — GCT measures full contact duration
- [ ] Both SETTLING and STANCE have `MAX_GCT_MS` timeout — no stuck state possible
- [ ] `MIN_GCT_MS` checked before recording `lastGCT` — rejects spurious toe-off signals

### Complementary filter
- [ ] `cfPitch = 0.98 × (cfPitch + gx × 0.01) + 0.02 × accelPitch` — signs and weights correct
- [ ] `CF_DT = 0.01` matches `SAMPLE_MS = 10ms` exactly — if sample rate changes, both must update together
- [ ] `accelPitch = atan2(ax, az_safe)` — correct axis pair for sagittal plane pitch
- [ ] `az_safe` clamp: `|az| < 0.01 → 0.01 × sign(az)` — prevents division instability without flipping sign
- [ ] Filter runs every sample (100 Hz) regardless of whether a step is in progress

### Strike / pronation classification
- [ ] Strike at IC from `cfPitch - neutralPitch` (delta, not absolute angle)
- [ ] `STRIKE_HEEL_DEG = +8°`, `STRIKE_FORE_DEG = -5°` — asymmetric thresholds intentional (heel strike more common)
- [ ] Pronation at toe-off from `peakRollDelta` during STANCE only — not from instantaneous roll at IC
- [ ] `peakRollDelta` reset to 0 at each IC — no carryover from previous step
- [ ] All three classification outputs covered: no gap between HEEL/FORE/MIDFOOT, no gap between OVER/RIGID/NEUTRAL

---

## App logic (`native/src/store/runStore.ts`)

### `tick()`
- [ ] `elapsed = Math.round((Date.now() - startTs) / 1000)` — wall-clock, not accumulator
- [ ] Guard: `if (!s.running) return` — first line
- [ ] Called from GPS task AND BackgroundTimer simultaneously — both calls produce same `elapsed` for the same second (idempotent)
- [ ] No `elapsed + 1` anywhere — that pattern drifts

### Coach trigger logic
- [ ] Each trigger has a "fired" check — cannot fire twice for the same elapsed second
- [ ] Trigger times derived from `elapsed` (wall-clock seconds), not a separate counter
- [ ] `appendLog` called for every trigger — creates audit trail in debug log

### `dominantStrike` / `dominantPronation` (DoneScreen)
- [ ] Sample count guard: `heel + mid + fore < MIN_CLASSIFIED_SAMPLES → return null`
- [ ] `Math.max` result compared with all three inputs — tie-break order intentional
- [ ] No unreachable `return` after exhaustive if-chain (dead code removed in v2.3.2)
- [ ] `MIN_CLASSIFIED_SAMPLES = 10` — extracted constant, not magic number inline

### BLE data parsing
- [ ] Field order matches firmware: `cadence, impact, gct, steps, strike, pronation`
- [ ] `parseInt` / `parseFloat` used with explicit radix — no implicit octal
- [ ] Strike/pronation `-1` (not yet classified) handled in UI — not shown as "midfoot" or "neutral"

---

## Red flags — logic errors that must be fixed immediately

| Finding | Why it matters |
|---|---|
| Accumulator-based `elapsed + 1` in `tick()` | Drifts under Doze; wrong after app resume |
| `while(true)` in firmware outside `calibrate()` | Permanent hang, BLE never starts |
| `peakRollDelta` not reset at IC | Pronation classification bleeds across steps |
| `gctStart` set at SETTLING entry, not IC | GCT consistently underestimates contact time |
| `cadCount` not capped at `CAD_BUF` | Reads uninitialised buffer entries → garbage cadence |
| CF seeded at 0.0 instead of `neutralPitch` | First 10-20 steps have wrong strike classification |
| Strike classified at toe-off instead of IC | Meaningless — foot is leaving the ground |
| Pronation classified at IC instead of toe-off | Misses the entire stance phase |
