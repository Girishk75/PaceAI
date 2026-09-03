# PaceAI — Claude Code Guidelines

## Working style (how to communicate with this user)

- **Explain in plain language.** No jargon, no code-speak, no long technical write-ups unless asked. Use everyday words and short analogies (e.g. "a real coach says it once, then changes tack"). If a technical term is unavoidable, define it in one plain phrase. When in doubt, simpler.
- **Always confirm before changing the repo.** Investigate and analyse freely, but propose the fix and wait for an explicit "yes" before editing code, bumping versions, committing, or pushing.
- **Take baby steps.** Diagnose one thing at a time; don't jump straight to fixing. Always consider how a change connects to previous changes and the rest of the system before making it.

---


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

---

## Android APK Build (MANDATORY — never suggest EAS cloud or eas build)

The user builds on **Windows** using local Gradle. Always give these exact steps:

```powershell
# 0. Make sure you are on the dev branch (work lands here, NOT on main)
cd C:\Users\Administrator\PaceAI
git branch --show-current
#    if it is not claude/build-paceai-coach-N3M2x:
#      git checkout -- native/package.json   (discard the prebuild edit, see note)
#      git checkout claude/build-paceai-coach-N3M2x

# 1. Pull latest
git pull origin claude/build-paceai-coach-N3M2x

# 2. Regenerate native Android folder (required after any app.json change)
cd C:\Users\Administrator\PaceAI\native
npx expo prebuild --platform android --clean

# 3. Build the APK
cd android
gradlew assembleRelease --rerun-tasks --no-build-cache
```

APK output path:
```
C:\Users\Administrator\PaceAI\native\android\app\build\outputs\apk\release\app-release.apk
```

Transfer the APK to the phone manually and install it.

**Never suggest** `eas build`, `eas build --local`, or `npx expo run:android` as the build method.

### Always include these git-recovery steps when giving pull/build instructions

`npx expo prebuild` rewrites `native/package.json` on every run, so a leftover
local change routinely blocks the next `git pull` / `git checkout`. The user
also often ends up on `main` (where the latest work does NOT live). Whenever you
hand out pull or build steps, include the recovery for these up front:

| Symptom on `git pull` / `git checkout` | Fix |
|---|---|
| `local changes to native/package.json would be overwritten` | `git checkout -- native/package.json` then re-run the command |
| `error: unfinished merge (MERGE_HEAD exists)` | `git merge --abort` then re-pull |
| stuck in vim (merge/commit message) | press **Esc**, type `:wq`, press **Enter** |
| vim swap-file prompt (`.MERGE_MSG.swp`) | press **E** (edit anyway), then save |
| file shows an old version after pulling | you are on `main` — `git checkout claude/build-paceai-coach-N3M2x` and pull that branch; also close/reopen the file in the editor (it caches) |
