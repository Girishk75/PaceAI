# Research — Can PaceAI drop the phone app?

> Deep-research report. Question explored: **how to deliver real-time spoken, LLM-quality running coaching using GPS pace/distance + ESP32 foot-pod biomechanics WITHOUT a phone in the loop** — motivated by wanting to remove the phone as the unreliable component (BLE drops, GPS drain, Android backgrounding).
>
> Method: 5 search angles → 21 sources fetched → 28 claims → 25 adversarially verified (22 confirmed, 3 refuted). Date: 2026-07-20. Confidence and sources noted per finding.

---

## Bottom line

**No off-the-shelf option delivers all four non-negotiables phone-free today.** The four are: (1) live GPS pace/distance, (2) foot-pod biomechanics over BLE, (3) LLM-quality (not canned) advice, (4) spoken audio mid-run.

The hard tension: requirement (3) needs connectivity, and the phone is currently what provides it. Removing the phone **relocates** the cellular link and audio path — it does not eliminate them — and for the stated motivation (reliability) it likely **trades one failure class for another** while leaving audio unsolved.

The only question that actually matters reduces to: **how do you reach a cloud LLM without the phone?** — because on-device LLM inference is not viable (below).

---

## Findings

### 1. On-device / edge LLM inference is NOT viable for quality coaching  *(high confidence)*
Microcontroller/Pi-class hardware cannot produce coaching-quality language. Verified demos:
- 28.9M-param model on an ESP32-S3 at ~9.5 tok/s — "cannot answer questions, follow instructions, write code, or recall facts"; emits only toy TinyStories-style prose.
- 135M model (SmolLM2) on a Pi Zero 2 W at ~9–11 tok/s — "repetitive or incoherent," tiny context window, "not for production," needs 2GB swap that wears the SD card.

The 256KB–2MB RAM ceiling on MCU-class parts is a hard architectural limit unlikely to change soon. A **rule-based** engine is the only network-free coaching option on such hardware — but that violates the "LLM-quality, not canned" requirement.
Sources: `github.com/slvDev/esp32-ai`, `github.com/ravijo/pi-llm`, Tom's Hardware (secondary).

### 2. Custom LTE hub is the most realistic phone-free path  *(high confidence)*
Modules that put cellular + GPS + BLE in a wearable package, keeping GPS and sensor-hubbing local and sending a small text prompt to a cloud LLM over LTE:
- **Walter** — ESP32-S3 + Sequans GM02SP LTE-M/NB-IoT + GNSS (GPS/GLONASS) + Wi-Fi/BLE, 24.8×55mm. Source: `dptechnics.com/en/products/walter.html`.
- **Nordic nRF9160 SiP** — Cortex-M33 + multimode LTE-M/NB-IoT modem + integrated GNSS + IPv4/IPv6 with TCP/TLS (secure HTTPS), globally certified, 10×16mm. Source: `nordicsemi.com/products/nrf9160`.

Both: LTE-M/NB-IoT is narrowband IoT connectivity — **kilobyte text payloads fit, streaming audio does not**. Both are microcontroller-class memory (16MiB flash/2MiB PSRAM; 1MB flash/256KB RAM) — **too small for any on-device LLM**, so cloud inference over cellular is the only path for this hardware.

### 3. Garmin Connect IQ can reach a cloud LLM phone-free — but only on LTE watches  *(high confidence)*
CIQ apps detect and use standalone LTE via `connectionInfo`/`:lte` (CIQ 3.0+), and `makeWebRequest` "will work regardless if the watch is connected via Bluetooth Smart, Wi-Fi, or LTE." **OAuth requires the phone**, so the LLM API must use plain API-key requests.
- **Device blocker:** LTE exists only on select models (FR945 LTE, vivoactive 3 LTE) — **NOT the Forerunner 245.**
- **Refuted claim:** the notion that migrating a CIQ app to LTE is "low-effort" did NOT survive verification (0-3) — treat it as a real port, not a modest delta.
- **Unverified:** whether CIQ can simultaneously hub a *custom* foot-pod GATT (BLE central role, non-standard service) + run real-time GPS + do outbound HTTPS within CIQ memory/background limits.
Source: `garmin.com/en-US/blog/developer/adapting-connect-iq-app-to-lte/`.

### 4. Commercial precedent: nobody has removed the phone  *(medium confidence)*
The closest shipping product — **Cadence / Kyde**, a real-time AI voice running coach — still runs as an iOS/Android app (phone is the compute hub, present in-pocket even hands-free) and generates its voice via **cloud ElevenLabs TTS**. Wearables (Apple Watch, Garmin, Whoop, Fitbit) are data sources feeding the phone, not the coaching engine. Leading LLM voice coaches have **not** eliminated the phone from the real-time loop.
Sources: `cadenceai.run`, App Store / Play Store listings.

---

## The audio gap (biggest unknown)

**None** of the verified sources established that any candidate MCU/watch can drive A2DP/BLE audio or acceptable embedded TTS to earbuds phone-free. Non-negotiable #4 (spoken audio mid-run) is **essentially unverified** and is the single riskiest piece of a phone-free design.

---

## Two honest cautions

1. **Reliability may not improve.** The motivation is to kill the phone *because* it's flaky. But LTE-M/NB-IoT adds cell-coverage gaps and higher latency; low-power IoT GNSS modems may give worse GPS accuracy / time-to-fix than a phone or the FR245 (likely, unverified); and simultaneous GNSS-fix + LTE-transmit is a real battery risk (active draw untested). You could swap BLE drops for cell drops.
2. **Nobody has shipped this**, which is a strong signal about difficulty.

---

## Recommendation for PaceAI

Given the actual motivation is **reliability**, a phone-free rebuild is a **large hardware project that doesn't clearly deliver the reliability goal and leaves audio unsolved.** The higher-return path is the one already underway: **harden the phone app's weak points** (BLE watchdog, GPS gates, background handling — the v2.4.x fixes), which is cheap and directly targets the failure class.

If phone-free is pursued as a *product* direction (not just a reliability fix), the concrete first step is a **Walter or nRF9160 hub prototype** — but before any hardware spend, resolve the two blockers this research could not:
1. **Audio** — can it drive earbuds / acceptable TTS phone-free?
2. **GPS** — is the IoT-modem GNSS accuracy/time-to-fix acceptable for running vs a phone or the FR245?

Those two answers decide whether the approach is even possible.

---

## Open questions (unresolved by this research)
- Audio output phone-free (architecture e) — CIQ audio to BLE earbuds; MCU A2DP/BLE audio; embedded TTS quality vs cloud.
- Real-world running GPS accuracy & time-to-fix of Walter/nRF9160 IoT GNSS vs phone / FR245.
- Can a Garmin LTE watch run a custom foot-pod GATT client + real-time GPS + HTTPS simultaneously within CIQ limits? (And none of it applies to the non-LTE FR245.)
- End-to-end latency, per-run cellular data cost, and continuous-use battery life of a cloud-LLM-over-LTE-M/NB-IoT hub.

## Sources (primary/high-value)
- Garmin Connect IQ + LTE: `garmin.com/en-US/blog/developer/adapting-connect-iq-app-to-lte/`
- Walter module: `dptechnics.com/en/products/walter.html`
- Nordic nRF9160: `nordicsemi.com/products/nrf9160`
- ESP32-S3 edge LLM: `github.com/slvDev/esp32-ai`; Tom's Hardware (secondary)
- Pi Zero 2 W edge LLM: `github.com/ravijo/pi-llm`
- Commercial precedent: `cadenceai.run` + app-store listings
