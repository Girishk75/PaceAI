---
name: research
description: Parallel research agent for PaceAI. Splits an open question into independent threads, dispatches one subagent per thread, and synthesises findings into an actionable recommendation. Use for hardware datasheets, platform API questions, biomechanics references, and cross-platform compatibility checks.
---

# Research

Use when the answer requires looking across multiple domains or sources simultaneously. Faster than sequential searching and avoids confirmation bias from stopping at the first plausible answer.

## Step 1 — Define the question precisely

Before spawning agents, state:
- **What you need to know** (not what you think the answer is)
- **What you already know** (don't re-search confirmed facts)
- **What you'll do with the answer** (shapes how specific the agents need to be)

## Step 2 — Split into independent research threads

Each thread should be answerable independently — no thread should depend on another's output.

**Common splits for PaceAI:**

| Question type | Threads to spawn |
|---|---|
| ESP32 / Arduino API | Thread 1: official docs / datasheet; Thread 2: known bugs / forum reports |
| React Native / Expo API | Thread 1: Expo SDK docs for the API; Thread 2: Android-specific behaviour / known issues |
| BLE protocol | Thread 1: GATT spec; Thread 2: react-native-ble-plx behaviour; Thread 3: ESP32 BLE stack quirks |
| Running biomechanics | Thread 1: academic definition; Thread 2: sensor-based measurement methods |
| Android background execution | Thread 1: Doze / App Standby docs; Thread 2: foreground service requirements; Thread 3: community workarounds |

## Step 3 — Dispatch subagents in parallel

**Agent prompt template:**
```
Research task for PaceAI — [THREAD TOPIC]

Context: [1-2 sentences on what PaceAI is and why this matters]

Question: [specific question for this thread]

Already confirmed (do not re-research):
- [list of known facts]

Deliver:
1. Direct answer to the question (2-3 sentences)
2. Key constraint or caveat that affects the PaceAI implementation
3. Source or basis for the answer (API name, spec section, or empirical observation)

Under 200 words.
```

## Step 4 — Synthesise

After all agents report:
1. Look for contradictions between threads — resolve before acting.
2. Identify the most constraining finding (the one that limits design choices).
3. Write one actionable recommendation: what to implement and why.

## Step 5 — State confidence

Rate the overall research result:
- **HIGH** — multiple independent sources agree, matches observed behaviour
- **MEDIUM** — plausible, one source, not tested on the actual hardware
- **LOW** — inference or extrapolation — flag to user before implementing

**Do not implement LOW confidence findings without telling the user the confidence level.**

---

## PaceAI-specific research domains

### Hardware (ESP32 + MPU6050)
- I2C pull-up requirements, clock speed limits
- LiPo charge/discharge curves at different draw rates
- ADC non-linearity on ESP32 (especially GPIO34-39)
- BLE TX power levels and actual current draw measurements
- MPU6050 I2C address conflicts (0x68 vs 0x69)

### Platform (React Native / Expo SDK 52)
- BackgroundTimer behaviour on Android vs iOS
- expo-task-manager location task constraints (minimum interval, accuracy)
- expo-file-system path guarantees across app restarts
- BLE permission requirements for Android 12+
- expo-sharing MIME type support per Android version

### Running science
- Ground contact time norms (elite vs recreational)
- Foot strike classification from IMU (peer-reviewed approaches)
- Cadence calculation from single-foot vs dual-foot pods
- Pronation angle measurement validity from ankle-mounted IMU
