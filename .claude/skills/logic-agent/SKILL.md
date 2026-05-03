---
name: logic-agent
description: Spawns a dedicated logic-analysis subagent for a specific PaceAI function or algorithm. Use when implementing a new sensor algorithm, debugging a calculation that produces wrong numbers, or verifying a state machine before flashing firmware. The subagent reasons independently — it does not inherit assumptions from the main conversation.
---

# Logic Agent

A subagent that does one thing: reason about whether a specific piece of code produces the correct output for all valid inputs. It reads the code cold, with no prior assumptions.

## When to spawn a logic agent

Spawn automatically (without waiting for user to ask) when:
- Implementing a new algorithm (new sensor metric, new classification, new filter)
- Changing thresholds or constants that affect sensor output
- A bug report shows a metric is wrong (cadence = 0, GCT always 410ms, strike always -1)
- Refactoring a state machine (GCT phases, run states in Zustand)
- Any change to `tick()`, `processSample()`, `calibrate()`, or `dominantStrike/Pronation`

## What the logic agent does NOT do

- Does not check style, naming, or formatting
- Does not check BLE connectivity or platform behaviour
- Does not fix the code — it reports findings; the main agent fixes
- Does not assume the current implementation is correct — it re-derives the expected output

## How to frame the subagent prompt

```
Logic analysis — PaceAI

Target: [function or section name, file path, line range]

Paste the exact code:
[paste function or section here]

Context (constants and globals used):
[paste relevant constants: GYRO_SETTLE, MIN_STEP_MS, CF_ALPHA, etc.]

Task:
1. Derive the expected output from first principles for the common case.
2. Identify the edge cases (zero inputs, maximum inputs, state machine stuck states, float precision limits).
3. Check each edge case: does the code handle it correctly?
4. Identify any unreachable code paths.
5. Identify any silent incorrect behaviour (produces a number, but the wrong number).

Return:
- PASS: code is correct for all cases found
- FINDINGS: list each issue as [SEVERITY: HIGH/MEDIUM/LOW] — description — line number
```

## Interpreting results

| Severity | Action |
|---|---|
| HIGH | Fix before committing. This produces wrong data on a real run. |
| MEDIUM | Fix if touched by this PR. Not an emergency but will cause confusion. |
| LOW | Note in code or CHANGELOG. Acceptable known limitation. |

If the agent returns PASS — state this to the user and proceed.
If the agent returns FINDINGS — present them before writing any fix.

## Example: spawning a logic agent for `processSample()`

When changing impact detection thresholds, spawn:

```
Logic analysis — PaceAI

Target: processSample() — strike detection section
File: firmware/PaceAI_FootPod_v2/PaceAI_FootPod_v2.ino

[paste strike detection block]

Constants:
- impactThresh: dynamically set in calibrate(), floor MIN_IMPACT_G = 2.0G
- exitThresh: impactThresh × IMPACT_EXIT_R (0.75)
- MIN_STEP_MS: 220ms
- lastStepMs: millis() at last step exit

Task: verify the entry/exit hysteresis is correct, the refractory period cannot fire twice for a single footstrike, and peakG correctly tracks the maximum across the full above-threshold window.
```

## Parallel use with `/code-review`

Logic agent and code review can run in parallel on different scopes:
- **Logic agent**: single function, deep correctness
- **Code review**: whole diff, breadth coverage

Fire both simultaneously when reviewing a PR that changes sensor algorithms.
