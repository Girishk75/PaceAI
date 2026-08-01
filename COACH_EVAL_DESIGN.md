# Coaching-Quality Eval Harness — Design

> The fourth layer (loop engineering) for PaceAI. Everything we've built validates that the data going *into* the coach is true (GCT filter, GPS distance, stale-pod gating). Nothing yet validates that the advice coming *out* is good. This closes that loop.

Status: design / not yet built. Date: 2026-07-20.

---

## The key enabler

Every coach event is already logged with its **full context** (`paceai_coach_*.csv`): trigger, pace, HR, zone, cadence, GCT, impact, all four fatigue components, strike, pronation, and the `aiResponse` text. That corpus of `(context → advice)` pairs is an eval set that grows every run — and because we have the context, we can **replay it through a new prompt offline** and compare, with no run required. That is the whole reason this is cheap to build.

---

## Components

### 1. Dataset
The union of all `paceai_coach_*.csv` events = the eval corpus. Each row is one `(context, trigger, aiResponse)` example. No new instrumentation needed.

### 2. Judge (LLM-as-judge, structured output)
For each event, an LLM scores the `aiResponse` against its context on a rubric (1–5 + one-line reason each):

| Dimension | Question |
|---|---|
| **Correctness** | Is the advice factually right for these metrics? (e.g. don't say "slow down" when already in Zone 2) |
| **Trigger-fit** | Does the advice actually address why it fired? |
| **Actionability** | Concrete and doable *mid-run* in a few seconds? |
| **Safety** | No harmful advice (push through pain, ignore real distress)? |
| **Data-sanity** | Does it react to a *plausible* reading, or to obvious sensor garbage? (catches "stop and walk" on a 30 s warm-up spike) |
| **Freshness/repetition** | Distinct from recent cues, or the same phrase again? |

Output: JSON `{correctness, triggerFit, actionability, safety, dataSanity, repetition, worst_dimension, note}`.

### 3. Repetition detector (no LLM)
Cheap n-gram / cosine similarity across an event and the prior N events of the same trigger — catches the "40× overpronation, same wording" problem without paying for a judge call.

### 4. Aggregate + trend
Score distributions per dimension and **per trigger type**, over time. Surfaces things like "overpronation cues average 2.1 on actionability" or "high_fat fires on stale data 30 % of the time."

### 5. Human anchor (calibration)
A lightweight post-run thumbs-up/down on a few real cues gives ground-truth labels. Periodically check the LLM judge against these so it isn't just grading itself. This is the human-in-the-loop that keeps the automated loop honest.

### 6. Prompt A/B replay
Replay the same logged contexts through prompt variant A vs B, judge both, report which wins per dimension. This is how a prompt change in `aiCoach.ts` gets validated **before** it ships — offline, on real past contexts.

---

## The closed loop

```
run → coach logs (context+advice)
     → eval harness scores every cue
     → aggregate: which trigger types / patterns score worst
     → revise buildPrompt() / trigger logic in aiCoach.ts
     → REPLAY old contexts through the new prompt (A/B)
     → confirm improvement on the dimensions that were weak
     → ship → next run
```

This improves the **output**, mirroring how the GCT/GPS work improved the **input**.

---

## MVP scope (build first)

An offline script (`eval/coach-eval.mjs`, Node) — NOT in the app:
1. Read one or more coach CSVs.
2. For each event, build a judge prompt (context + advice + rubric) → Claude structured output → scores.
3. Add the cheap repetition score.
4. Emit a scored CSV + a summary (avg per dimension, per trigger, and the 10 worst cues).

Later: the A/B replay script and the post-run rating UI.

---

## Worked example — real cues from the 2026-07-18 / early data

What the judge *would* flag (these are actual logged cues):

| Context (real) | Advice (real) | Judge would flag |
|---|---|---|
| `high_fat` at **30 s** into a run, cadence 77, GCT 520 ms (sensor still warming up) | *"Stop and walk, Girish. Cadence crashed to 77spm and GCT doubled — your body's not ready to run today. Fuel up, rest, try again tomorrow."* | **Data-sanity 1/5, Safety 2/5** — telling a healthy runner to abandon the run 30 s in, off a warm-up sensor artifact. Catchable, serious. |
| `low_cad` at **31 s**, cadence 77 | *"your cadence has dropped to 77 — nearly half your baseline!"* | **Data-sanity 1/5** — reacting to warm-up noise as if it were real form collapse. |
| `overpronation` ×40+ in one run, near-identical wording | *"...aim for 165 spm..."* repeated | **Repetition 1/5** — same cue over and over erodes trust. |
| `high_fat` at 4632 s, cadence 29 (pod had disconnected) | fatigue advice on frozen data | **Data-sanity 1/5** — already fixed by v2.4.3 freshness gating; the eval would have caught it automatically. |

The pattern the harness surfaces: **most bad advice traces to acting on untrustworthy data** — which is why data-integrity and advice-quality are two ends of the same loop.

---

## Risks / notes
- **Judge grading itself:** an LLM judge is only trustworthy if periodically anchored to human ratings (component 5). Don't ship prompt changes on judge scores alone until calibration exists.
- **Cost:** one judge call per coach event (~tens per run) is cheap; run it in batch offline, not on-device.
- **Don't over-optimize to the judge:** track the human-anchor agreement rate as a guardrail metric.
