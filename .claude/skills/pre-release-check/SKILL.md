---
name: pre-release-check
description: Hard gate before any PaceAI release commit. Verifies version consistency across package.json and app.json, versionCode increment, CHANGELOG entry, branch correctness, and no uncommitted surprises. Run this before /release.
---

# Pre-Release Check

Run this **before** the `/release` skill. If any check fails, stop — do not commit.

## Step 1 — Read current versions

```bash
grep '"version"' native/package.json
grep '"version"\|"versionCode"' native/app.json
```

Record:
- `package.json` version: ___
- `app.json` version: ___
- `app.json` versionCode: ___

## Step 2 — Version consistency

- [ ] `package.json` version == `app.json` version (exact string match)
- [ ] `app.json` versionCode == previous versionCode + 1 (exactly)

If either fails → fix before proceeding.

## Step 3 — Version bump type is correct

| What changed in this diff | Expected bump |
|---|---|
| Bug fix, UI tweak, firmware patch, debug tooling | **Patch** (x.y.Z) |
| New screen, new feature, new sensor integration | **Minor** (x.Y.0) |
| Breaking change, full rewrite | **Major** (X.0.0) |

- [ ] The bump type matches what actually changed in the diff

## Step 4 — CHANGELOG

```bash
head -20 native/CHANGELOG.md
```

- [ ] Top entry matches the version being released
- [ ] Date is today (`currentDate` from context, or `date +%Y-%m-%d`)
- [ ] Has at least one bullet under `### Fixed`, `### Added`, or `### Changed`
- [ ] Bullet describes user-visible change (not an internal refactor note)

## Step 5 — Branch

```bash
git branch --show-current
```

- [ ] Branch is `claude/build-paceai-coach-N3M2x`
- [ ] NOT `main` or any other branch

## Step 6 — Clean working tree

```bash
git status --short
```

- [ ] No unexpected untracked files
- [ ] No unstaged changes to version files
- [ ] Files staged are only what belongs in this release

## Step 7 — BLE protocol unchanged (if firmware changed)

If `firmware/` is in the diff:
- [ ] `SERVICE_UUID` unchanged: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- [ ] `CHARACTERISTIC_UUID` unchanged: `beb5483e-36e1-4688-b7f5-ea07361b26a8`
- [ ] Broadcast field order unchanged: `cadence,impact,gct,steps,strike,pronation`

If any UUID changed → major version bump required + app update to match.

## Step 8 — No debug artifacts left in

```bash
grep -r "console\.log" native/src/ --include="*.ts" --include="*.tsx" | grep -v debugLog
grep "Serial.print" firmware/PaceAI_FootPod_v2/PaceAI_FootPod_v2.ino | grep -v "\[BLE\]"
```

- [ ] No stray `console.log` in app source (debug overlay + `appendLog` are fine)
- [ ] No per-sample `Serial.print` in firmware loop (only 1Hz `[BLE]` line is fine)

## Pass / Fail

**All boxes checked → run `/release`**

**Any box unchecked → fix first, re-run this checklist**

## Common failures

| Failure | Fix |
|---|---|
| Versions don't match | Edit both files to agree, then re-check |
| versionCode jumped by 2 | Edit `app.json` to previous versionCode + 1 |
| CHANGELOG date wrong | Fix the date — use today's date from `currentDate` context |
| On wrong branch | `git checkout claude/build-paceai-coach-N3M2x` |
| Untracked files in `native/` | Stage them or add to `.gitignore` |
