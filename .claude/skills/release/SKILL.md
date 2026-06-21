---
name: release
description: Use when preparing a release commit. Enforces the mandatory version bump in package.json and app.json, CHANGELOG entry, commit message format, and push to the dev branch. Never push to main without explicit instruction.
---

# Release

Enforces the mandatory versioning rules from CLAUDE.md on every release commit.

## Rules (from CLAUDE.md)

| Change type | Bump | Example |
|---|---|---|
| New screen, new feature, new sensor integration | **Minor** | 2.1 → 2.2 |
| Bug fix, UI tweak, performance patch, debug tooling | **Patch** | 2.1.1 → 2.1.2 |
| Breaking change or full rewrite | **Major** | 2.x → 3.0 |

`versionCode` is an integer — **always increment by exactly 1**.

## Files that MUST be updated together

| File | Fields |
|---|---|
| `native/package.json` | `"version"` |
| `native/app.json` | `"version"` and `"versionCode"` |
| `native/CHANGELOG.md` | New `## [x.y.z] — YYYY-MM-DD` entry |

## Step 1 — Determine version bump

Ask: what changed?
- Bug fix / UI tweak / firmware patch → **patch** (x.y.Z)
- New feature / new screen / new sensor → **minor** (x.Y.0)
- Breaking change → **major** (X.0.0)

## Step 2 — Read current versions

```bash
grep '"version"' native/package.json
grep '"version"\|"versionCode"' native/app.json
```

## Step 3 — Update versions

Update `native/package.json`:
```json
"version": "x.y.z"
```

Update `native/app.json`:
```json
"version": "x.y.z",
"versionCode": N+1
```

Both files must match. versionCode increments by 1 only.

## Step 4 — Write CHANGELOG entry

Add at the top of `native/CHANGELOG.md` (below the header):

```markdown
## [x.y.z] — YYYY-MM-DD

### Fixed / Added / Changed
- **Short title** — what changed and why it matters to a runner using the app.
```

Today's date: read from system or use the `currentDate` context if available.

Use `### Fixed` for bug fixes, `### Added` for new features, `### Changed` for behaviour changes.

## Step 5 — Stage and commit

Stage only relevant files:
```bash
git add native/package.json native/app.json native/CHANGELOG.md
git add <other changed files>
```

Commit message format:
```
type(vX.Y.Z): short description

Longer explanation of what changed and why.

https://claude.ai/code/session_01P4gn7wku48AQkob6LfxKtQ
```

Where `type` is: `feat`, `fix`, `refactor`, `chore`, `docs`.

## Step 6 — Push

```bash
git push -u origin claude/build-paceai-coach-N3M2x
```

**Never push to `main`** without explicit instruction from the user.

## Step 7 — Confirm

```bash
git log --oneline -3
```

Verify the commit appears with the correct version tag.

## Checklist before declaring done

- [ ] `native/package.json` version updated
- [ ] `native/app.json` version updated (matches package.json)
- [ ] `native/app.json` versionCode incremented by exactly 1
- [ ] `native/CHANGELOG.md` has new entry with today's date
- [ ] Committed to `claude/build-paceai-coach-N3M2x`
- [ ] Pushed successfully

## Common mistakes to avoid

- Updating only one of the two version files
- Forgetting to increment versionCode
- Using the wrong date in CHANGELOG
- Pushing to main
- Bumping minor instead of patch for a bug fix (or vice versa)
