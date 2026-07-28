# Graph Report - .  (2026-07-28)

## Corpus Check
- Corpus is ~36,338 words - fits in a single context window. You may not need a graph.

## Summary
- 310 nodes · 581 edges · 17 communities (15 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Expo & Third-Party Libs
- GPS & Pace Algorithms
- Agent Skills & Workflows
- UI Components & Screens
- App Config & Build
- Fatigue & HR Zone Algorithms
- BLE Service & Settings
- Package & Scripts
- Code Review & QA Skills
- Dev Dependencies
- App Entry & BLE Hook
- Debug Log Service
- TypeScript Config
- PWA Spec & Simulation
- APK Build Process
- Development Branch

## God Nodes (most connected - your core abstractions)
1. `useRunStore` - 22 edges
2. `BLEService` - 20 edges
3. `formatTime()` - 15 edges
4. `log()` - 15 edges
5. `formatPace()` - 14 edges
6. `LiveRunScreen()` - 14 edges
7. `permissions` - 11 edges
8. `DoneScreen()` - 11 edges
9. `expo` - 10 edges
10. `loadSettings()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Requesting Code Review Skill` --semantically_similar_to--> `PaceAI Code Review Skill`  [INFERRED] [semantically similar]
  .agents/skills/requesting-code-review/SKILL.md → .claude/skills/code-review/SKILL.md
- `Fatigue Index Algorithm (0-10 composite: HR 0.35 + Cadence 0.25 + GCT 0.20 + Impact 0.20)` --semantically_similar_to--> `B10: peakFatigue Tracking in runStore`  [INFERRED] [semantically similar]
  PaceAI_ClaudeCode_Brief.md → BACKLOG.md
- `PaceAI PWA v9.3 HTML App (index.html)` --semantically_similar_to--> `PaceAI PWA: Single HTML File Progressive Web App`  [INFERRED] [semantically similar]
  index.html → PaceAI_ClaudeCode_Brief.md
- `PaceAI PWA v9.3 HTML App (index-1.html)` --semantically_similar_to--> `PaceAI PWA v9.3 HTML App (index.html)`  [INFERRED] [semantically similar]
  index-1.html → index.html
- `B2: BLE Monitor Error CancelConnection Race Condition` --conceptually_related_to--> `v2.2.0: BLEService Class-Based Singleton Architectural Revamp`  [INFERRED]
  BACKLOG.md → native/CHANGELOG.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Release Quality Gate Workflow** — _claude_skills_code_review_skill_code_review, _claude_skills_pre_release_check_skill_pre_release_check, _claude_skills_release_skill_release [INFERRED 0.85]
- **Algorithm Correctness Analysis Workflow** — _claude_skills_logic_agent_skill_logic_agent, _claude_skills_logic_review_skill_logic_review, _claude_skills_code_review_skill_code_review [EXTRACTED 0.95]
- **BLE Protocol Verification Group** — _claude_skills_code_review_skill_code_review, _claude_skills_pre_release_check_skill_pre_release_check, _claude_skills_diagnose_skill_diagnose, _claude_skills_firmware_flash_checklist_skill_firmware_flash_checklist [INFERRED 0.85]
- **Fatigue Index Sensor Pipeline: ESP32 + Garmin HR + GPS all feed the composite Fatigue Index** — paceai_claudecode_brief_esp32_foot_pod, paceai_claudecode_brief_garmin_fr245, paceai_claudecode_brief_gps_distance_accumulation, paceai_claudecode_brief_fatigue_index [EXTRACTED 0.95]
- **AI Coaching System: Triggers + Runner Profile + Claude Sonnet + Coach Log form the coaching loop** — paceai_claudecode_brief_ai_coaching_triggers, paceai_claudecode_brief_runner_profile, paceai_claudecode_brief_claude_sonnet, paceai_claudecode_brief_coach_log [EXTRACTED 0.95]
- **BLE Reliability Bug Cluster: B2 + B3 + B4 all target bleService.ts and share the same root cause domain** — backlog_b2_ble_monitor_race, backlog_b3_scan_fallback_bug, backlog_b4_scan_uuid_filter, native_changelog_v2_2_0_ble_service_revamp [INFERRED 0.85]

## Communities (17 total, 2 thin omitted)

### Community 0 - "Expo & Third-Party Libs"
Cohesion: 0.04
Nodes (49): expo, expo-file-system, expo-font, @expo-google-fonts/barlow, @expo-google-fonts/rajdhani, @expo-google-fonts/share-tech-mono, expo-keep-awake, expo-location (+41 more)

### Community 1 - "GPS & Pace Algorithms"
Cohesion: 0.08
Nodes (31): formatPace(), formatTime(), haversineMetres(), PaceSmoother, useGPS(), ab, fg, ld (+23 more)

### Community 2 - "Agent Skills & Workflows"
Cohesion: 0.06
Nodes (37): Research Confidence Levels (HIGH/MEDIUM/LOW), Parallel Subagent Dispatch Pattern, Research Skill: Parallel Research Agent for PaceAI, Run Test Pass Criteria, Run Test Checklist Skill, B10: peakFatigue Tracking in runStore, B2: BLE Monitor Error CancelConnection Race Condition, B3: No Scan Fallback After Repeated Direct Reconnect Failures (+29 more)

### Community 3 - "UI Components & Screens"
Cohesion: 0.11
Nodes (27): DebugOverlay(), st, bg, dominantPronation(), dominantStrike(), DoneScreen(), st, HistoryScreen() (+19 more)

### Community 4 - "App Config & Build"
Cohesion: 0.08
Nodes (25): package, permissions, versionCode, projectId, expo, android, backgroundColor, extra (+17 more)

### Community 5 - "Fatigue & HR Zone Algorithms"
Cohesion: 0.14
Nodes (15): calcFatigue(), getHRZone(), simHR(), HR_ZONES, RUN_TYPES, RUNNER, RunType, Weather (+7 more)

### Community 6 - "BLE Service & Settings"
Cohesion: 0.30
Nodes (4): SettingsScreen(), BLEService, log(), loadSettings()

### Community 7 - "Package & Scripts"
Cohesion: 0.15
Nodes (14): main, name, scripts, android, build:android, postinstall, start, version (+6 more)

### Community 8 - "Code Review & QA Skills"
Cohesion: 0.27
Nodes (13): Code Reviewer Agent Template, Requesting Code Review Skill, BLE Protocol Compatibility, PaceAI Code Review Skill, PaceAI Diagnose Skill, Firmware Flash Checklist Skill, Logic Agent Skill, Firmware Calibration Process (+5 more)

### Community 9 - "Dev Dependencies"
Cohesion: 0.18
Nodes (11): @babel/core, expo-build-properties, devDependencies, @babel/core, expo-build-properties, patch-package, @types/react, typescript (+3 more)

### Community 10 - "App Entry & BLE Hook"
Cohesion: 0.43
Nodes (6): App(), Navigator(), useBLE(), prewarmGPS(), SetupScreen(), initTTS()

### Community 11 - "Debug Log Service"
Cohesion: 0.57
Nodes (6): allLines, flushDebugLog(), logPath(), saveDebugLogWithTimestamp(), shareDebugLog(), shareLastDebugLog()

### Community 12 - "TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, baseUrl, paths, strict, extends, expo/tsconfig.base

### Community 13 - "PWA Spec & Simulation"
Cohesion: 0.50
Nodes (4): PaceAI PWA v9.3 HTML App (index-1.html), PaceAI PWA v9.3 HTML App (index.html), PaceAI PWA: Single HTML File Progressive Web App, Simulation Mode (all metrics fall back gracefully when hardware not connected)

## Knowledge Gaps
- **116 isolated node(s):** `name`, `slug`, `version`, `orientation`, `userInterfaceStyle` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Expo & Third-Party Libs` to `Package & Scripts`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **Why does `react-native-ble-plx` connect `Package & Scripts` to `App Config & Build`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `plugins` connect `App Config & Build` to `Package & Scripts`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Expo & Third-Party Libs` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._
- **Should `GPS & Pace Algorithms` be split into smaller, more focused modules?**
  _Cohesion score 0.0824524312896406 - nodes in this community are weakly interconnected._
- **Should `Agent Skills & Workflows` be split into smaller, more focused modules?**
  _Cohesion score 0.06401137980085349 - nodes in this community are weakly interconnected._