# PaceAI — Claude Code Guidelines

## Versioning (MANDATORY on every code change)

Every commit that changes app behaviour **must** bump the version in both files:

| File | Field |
|------|-------|
| `native/package.json` | `"version"` |
| `native/app.json` | `"version"` and `"versionCode"` |

`versionCode` is an integer — always increment by exactly 1.

### Which version segment to bump

| Change type | Bump | Example |
|---|---|---|
| New screen, new feature, new sensor integration | **Minor** | 2.1 → 2.2 |
| Bug fix, UI tweak, performance patch, debug tooling | **Patch** | 2.1.1 → 2.1.2 |
| Breaking change or full rewrite | **Major** | 2.x → 3.0 |

### Also update the CHANGELOG

Add an entry to `native/CHANGELOG.md` under a new `## [x.y.z] — YYYY-MM-DD` heading with `### Added`, `### Changed`, or `### Fixed` sections as appropriate.

---

## Branch

All development goes on `claude/build-paceai-coach-N3M2x`. Never push to `main` without explicit instruction.

## Project layout

```
native/          React Native Android app (Expo SDK 52)
firmware/        ESP32 Arduino sketches
```

## Key files

- `native/src/store/runStore.ts` — single Zustand store for all run state
- `native/src/hooks/useBLE.ts` — BLE scan/connect for HR + foot pod
- `native/src/services/bleManager.ts` — shared BleManager singleton
- `native/src/services/storage.ts` — AsyncStorage settings (apiKey, device IDs, debugMode)
- `firmware/PaceAI_FootPod_v2/PaceAI_FootPod_v2.ino` — ESP32 foot pod firmware
