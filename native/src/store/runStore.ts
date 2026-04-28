import { create } from 'zustand';
import { RunType, Weather, RUNNER } from '../constants/runner';
import { calcFatigue } from '../algorithms/fatigue';
import { formatTime } from '../algorithms/gps';
import { getHRZone, simHR } from '../algorithms/hrZone';

export type Screen = 'setup' | 'live' | 'paused' | 'done' | 'history' | 'settings';

export interface RunConfig {
  runType:    RunType;
  targetDist: number;   // km, 0 = open
  targetPace: number;   // sec/km, 0 = none
  weather:    Weather;
}

export interface RunState {
  // Navigation
  screen: Screen;

  // Config (set at run start)
  runId:      string;
  runDate:    string;
  runTime:    string;
  runConfig:  RunConfig;

  // Timer
  running:     boolean;
  startTs:     number;   // wall-clock ms when run started
  elapsedSecs: number;

  // Distance / pace
  dist:          number;  // km (accumulated)
  gpsDist:       number;  // km (raw GPS)
  gpsPace:       number;  // sec/km (smoothed, 0 = no fix)
  gpsPaceTs:     number;  // ms — when gpsPace last updated
  gpsPaceStale:  boolean;
  gpsAccuracy:   number;
  displayPace:   number;  // what to show (real or sim)

  // HR
  hr:             number;
  hrZone:         number;
  hrConnected:    boolean;
  lastHrPacketTs: number;  // ms — wall clock of last BLE HR packet
  hrSum:          number;
  hrCount:        number;
  maxHR:          number;

  // Foot pod
  cadence:        number;  // total spm (both feet, direct from firmware)
  steps:          number;  // per run (offset corrected)
  impact:         number;  // G — rolling 4-value average
  impBuffer:      number[];  // last 4 raw impact readings for smoothing
  cadSum:         number;
  cadCount:       number;
  impSum:         number;
  impCount:       number;
  gctSum:         number;
  gctCount:       number;
  gct:            number;  // ms
  fpConnected:    boolean;
  fpRawSteps:     number;  // cumulative from ESP32
  fpStepsOffset:  number;
  lastFpPacketTs: number;  // ms — wall clock of last BLE foot pod packet

  // Strike / pronation (v2.3)
  strikeCode:        number;  // most recent: -1=unknown, 0=midfoot, 1=heel, 2=forefoot
  pronationCode:     number;  // most recent: -1=unknown, 0=neutral, 1=over, 2=rigid
  strikeHeel:        number;
  strikeMid:         number;
  strikeFore:        number;
  pronNeutral:       number;
  pronOver:          number;
  pronRigid:         number;
  lastStrikeCoachTs: number;
  lastPronCoachTs:   number;

  // Debug
  debugMode: boolean;
  debugLog:  string[];  // rolling 200-line in-memory log

  // Fatigue
  fatigueTotal: number;
  fatigueHR:    number;
  fatigueCad:   number;
  fatigueGCT:   number;
  fatigueImp:   number;

  // Coach triggers (timestamps/flags)
  coachMuted:      boolean;
  isSpeaking:      boolean;
  lastCoachTs:     number;
  lastKmCoached:   number;
  hr4Coached:      boolean;
  lastSlowCoachTs: number;
  lastFastCoachTs: number;
  lastCadCoachTs:  number;
  lastImpCoachTs:  number;
  lastFatCoachTs:  number;
  lastZ5CoachTs:   number;

  // Actions
  setScreen:      (s: Screen) => void;
  startRun:       (config: RunConfig) => void;
  pauseRun:       () => void;
  resumeRun:      () => void;
  endRun:         () => void;
  tick:           () => void;
  updateGPS:      (pace: number, distKm: number, accuracy: number) => void;
  updateHR:       (hr: number) => void;
  updateFootPod:  (cad: number, impact: number, gct: number, rawSteps: number, strike?: number, pronation?: number) => void;
  setFpConnected: (v: boolean) => void;
  setHrConnected: (v: boolean) => void;
  setSpeaking:    (v: boolean) => void;
  setMuted:       (v: boolean) => void;
  markCoach:      (trigger: string) => void;
  setDebugMode:   (v: boolean) => void;
  appendLog:      (line: string) => void;
}

function newRunId(): string {
  return `run_${Date.now()}`;
}

function logEntry(current: string[], line: string): string[] {
  const ts = new Date().toTimeString().slice(0, 8);
  const entry = `${ts}  ${line}`;
  return current.length >= 200 ? [...current.slice(-199), entry] : [...current, entry];
}

function simPace(config: RunConfig, elapsed: number): number {
  if (config.targetPace > 0) {
    return config.targetPace + Math.round((Math.random() - 0.5) * 15);
  }
  const base = config.runType === 'easy' ? 390
             : config.runType === 'tempo' ? 310
             : config.runType === 'race'  ? 285
             : 360;
  return base + Math.round((Math.random() - 0.5) * 20);
}

export const useRunStore = create<RunState>((set, get) => ({
  screen:     'setup',
  runId:      '',
  runDate:    '',
  runTime:    '',
  runConfig:  { runType: 'easy', targetDist: 5, targetPace: 0, weather: 'humid' },

  running:      false,
  startTs:      0,
  elapsedSecs:  0,

  dist:         0,
  gpsDist:      0,
  gpsPace:      0,
  gpsPaceTs:    0,
  gpsPaceStale: false,
  gpsAccuracy:  999,
  displayPace:  0,

  hr:             0,
  hrZone:         1,
  hrConnected:    false,
  lastHrPacketTs: 0,
  hrSum:   0,
  hrCount: 0,
  maxHR:   0,

  cadence:        0,
  steps:          0,
  impact:         0,
  impBuffer:      [],
  cadSum:  0, cadCount: 0,
  impSum:  0, impCount: 0,
  gctSum:  0, gctCount: 0,
  gct:            0,
  fpConnected:    false,
  fpRawSteps:     0,
  fpStepsOffset:  -1,
  lastFpPacketTs: 0,

  strikeCode: -1, pronationCode: -1,
  strikeHeel: 0, strikeMid: 0, strikeFore: 0,
  pronNeutral: 0, pronOver: 0, pronRigid: 0,
  lastStrikeCoachTs: 0, lastPronCoachTs: 0,

  debugMode: false,
  debugLog:  [],

  fatigueTotal: 0,
  fatigueHR:    0,
  fatigueCad:   0,
  fatigueGCT:   0,
  fatigueImp:   0,

  coachMuted:      false,
  isSpeaking:      false,
  lastCoachTs:     0,
  lastKmCoached:   0,
  hr4Coached:      false,
  lastSlowCoachTs: 0,
  lastFastCoachTs: 0,
  lastCadCoachTs:  0,
  lastImpCoachTs:  0,
  lastFatCoachTs:  0,
  lastZ5CoachTs:   0,

  setScreen: (s) => set({ screen: s }),

  startRun: (config) => {
    const now = new Date();
    set({
      screen:      'live',
      runId:       newRunId(),
      runDate:     now.toISOString().split('T')[0],
      runTime:     now.toTimeString().slice(0, 8),
      runConfig:   config,
      running:     true,
      startTs:     Date.now(),
      elapsedSecs: 0,
      dist:        0,
      gpsDist:     0,
      gpsPace:     0,
      gpsPaceTs:   0,
      gpsPaceStale:false,
      displayPace: 0,
      hr:          0,
      hrZone:      1,
      cadence:     0,
      steps:       0,
      impact:      0,
      impBuffer:   [],
      gct:         0,
      fpRawSteps:  0,
      fpStepsOffset: -1,
      fatigueTotal: 0,
      fatigueHR:   0,
      fatigueCad:  0,
      fatigueGCT:  0,
      fatigueImp:  0,
      lastCoachTs: 0,
      lastKmCoached: 0,
      hr4Coached:  false,
      lastSlowCoachTs: 0,
      lastFastCoachTs: 0,
      lastCadCoachTs:  0,
      lastImpCoachTs:  0,
      lastFatCoachTs:  0,
      lastZ5CoachTs:   0,
      hrSum:  0, hrCount: 0, maxHR:  0,
      cadSum: 0, cadCount: 0,
      impSum: 0, impCount: 0,
      gctSum: 0, gctCount: 0,
      strikeCode: -1, pronationCode: -1,
      strikeHeel: 0, strikeMid: 0, strikeFore: 0,
      pronNeutral: 0, pronOver: 0, pronRigid: 0,
      lastStrikeCoachTs: 0, lastPronCoachTs: 0,
    });
  },

  pauseRun: () => set({ running: false, screen: 'paused' }),

  resumeRun: () => set({ running: true, screen: 'live' }),

  endRun: () => set({ running: false, screen: 'done' }),

  tick: () => {
    const s = get();
    if (!s.running) return;

    const now = Date.now();
    const elapsed = s.elapsedSecs + 1;

    // GPS staleness (15s without update)
    const stale = s.gpsPace > 0 && (now - s.gpsPaceTs) > 15000;

    // Pace for distance accumulation
    const paceForDist = (s.gpsPace > 0 && !stale)
      ? s.gpsPace
      : simPace(s.runConfig, elapsed);

    // Distance: accumulate per second, never go backwards, sync when GPS jumps ahead
    let dist = s.dist + 1 / paceForDist; // km per second
    if (s.gpsDist > dist) dist = s.gpsDist;

    // Display pace
    const displayPace = (s.gpsPace > 0 && !stale) ? s.gpsPace : simPace(s.runConfig, elapsed);

    // HR: use real value only when a packet arrived in the last 5s; otherwise simulate.
    // Prevents stale hrConnected=true from locking in a simulated value or zero.
    const hrFresh = s.hrConnected && s.lastHrPacketTs > 0 && (now - s.lastHrPacketTs) < 5000;
    const hr = hrFresh ? s.hr : simHR(elapsed, s.runConfig.runType);
    const hrZone = getHRZone(hr);

    // Fatigue
    const fat = calcFatigue(hr, s.cadence || 170, s.gct || 245, s.impact || RUNNER.baseImpact, elapsed);

    set({
      elapsedSecs:  elapsed,
      dist,
      gpsPaceStale: stale,
      displayPace,
      hr,
      hrZone,
      fatigueTotal: fat.total,
      fatigueHR:    fat.hr,
      fatigueCad:   fat.cad,
      fatigueGCT:   fat.gct,
      fatigueImp:   fat.imp,
    });
  },

  updateGPS: (pace, distKm, accuracy) => {
    const s = get();
    // On first fix: if we've already accumulated distance via sim, don't reset
    let gpsDist = distKm;
    if (distKm === 0 && s.dist > 0) gpsDist = s.dist;

    set({
      gpsPace:    pace,
      gpsPaceTs:  Date.now(),
      gpsDist,
      gpsAccuracy: accuracy,
    });
  },

  updateHR: (hr) => {
    const s = get();
    const now     = Date.now();
    const hrZone  = getHRZone(hr);
    const hrSum   = s.hrSum + hr;
    const hrCount = s.hrCount + 1;
    const maxHR   = Math.max(s.maxHR, hr);
    // Only log when value changes — Garmin sends at ~2 Hz which would flood the log
    if (s.debugMode && hr !== s.hr) {
      set({ hr, hrZone, lastHrPacketTs: now, hrSum, hrCount, maxHR, debugLog: logEntry(s.debugLog, `[HR]  ${hr} bpm  Z${hrZone}`) });
    } else {
      set({ hr, hrZone, lastHrPacketTs: now, hrSum, hrCount, maxHR });
    }
  },

  updateFootPod: (cad, impact, gct, rawSteps, strike = -1, pronation = -1) => {
    const s = get();
    const now = Date.now();

    // Cadence: firmware sends total spm (both feet) — no doubling needed.
    const cadence = (cad > 0 && cad < 250) ? cad : s.cadence;

    // Impact: 4-value rolling average smooths the footstrike/swing alternation
    // (ESP32 alternates between ~9G landing peak and ~2.7G swing phase at 1 Hz).
    const impBuffer = impact > 0
      ? [...s.impBuffer.slice(-3), impact]
      : s.impBuffer;
    const smoothImpact = impBuffer.length > 0
      ? impBuffer.reduce((a, b) => a + b, 0) / impBuffer.length
      : s.impact;

    // Step offset: set on first packet after run start
    const offset  = s.fpStepsOffset < 0 ? rawSteps : s.fpStepsOffset;
    const steps   = Math.max(0, rawSteps - offset);

    // Strike / pronation — update most-recent code and per-type counts
    const strikeCode    = strike    >= 0 ? strike    : s.strikeCode;
    const pronationCode = pronation >= 0 ? pronation : s.pronationCode;
    const strikeHeel  = s.strikeHeel  + (strike === 1 ? 1 : 0);
    const strikeMid   = s.strikeMid   + (strike === 0 ? 1 : 0);
    const strikeFore  = s.strikeFore  + (strike === 2 ? 1 : 0);
    const pronNeutral = s.pronNeutral + (pronation === 0 ? 1 : 0);
    const pronOver    = s.pronOver    + (pronation === 1 ? 1 : 0);
    const pronRigid   = s.pronRigid   + (pronation === 2 ? 1 : 0);

    const base = {
      cadence,
      impact:         impact > 0 ? smoothImpact : s.impact,
      impBuffer,
      gct:            gct > 0 ? gct : s.gct,
      fpRawSteps:     rawSteps,
      fpStepsOffset:  offset,
      steps,
      lastFpPacketTs: now,
      cadSum:   cadence > 0 ? s.cadSum   + cadence      : s.cadSum,
      cadCount: cadence > 0 ? s.cadCount + 1            : s.cadCount,
      impSum:   impact  > 0 ? s.impSum   + smoothImpact : s.impSum,
      impCount: impact  > 0 ? s.impCount + 1            : s.impCount,
      gctSum:   gct     > 0 ? s.gctSum   + gct          : s.gctSum,
      gctCount: gct     > 0 ? s.gctCount + 1            : s.gctCount,
      strikeCode, pronationCode,
      strikeHeel, strikeMid, strikeFore,
      pronNeutral, pronOver, pronRigid,
    };

    if (s.debugMode) {
      const strLabel = strike >= 0 ? ['mid','heel','fore'][strike] : '-';
      const proLabel = pronation >= 0 ? ['neu','over','rig'][pronation] : '-';
      set({ ...base, debugLog: logEntry(s.debugLog,
        `[FP]  cad=${cadence} imp=${impact.toFixed(2)}G gct=${Math.round(gct)}ms steps=${steps} str=${strLabel} pro=${proLabel}`) });
    } else {
      set(base);
    }
  },

  setFpConnected: (v) => {
    const s = get();
    if (s.debugMode) {
      set({ fpConnected: v, debugLog: logEntry(s.debugLog, `[BLE] FP ${v ? 'connected' : 'disconnected'}`) });
    } else {
      set({ fpConnected: v });
    }
  },

  setHrConnected: (v) => {
    const s = get();
    if (s.debugMode) {
      set({ hrConnected: v, debugLog: logEntry(s.debugLog, `[BLE] HR ${v ? 'connected' : 'disconnected'}`) });
    } else {
      set({ hrConnected: v });
    }
  },
  setSpeaking:    (v) => set({ isSpeaking: v }),
  setMuted:       (v) => set({ coachMuted: v }),

  setDebugMode: (v) => set({ debugMode: v }),

  appendLog: (line) => {
    const s = get();
    set({ debugLog: logEntry(s.debugLog, line) });
  },

  markCoach: (trigger) => {
    const now = Date.now();
    const update: Partial<RunState> = { lastCoachTs: now };
    if (trigger === 'z4_entry') update.hr4Coached   = true;
    if (trigger === 'pace_slow') update.lastSlowCoachTs = now;
    if (trigger === 'pace_fast') update.lastFastCoachTs = now;
    if (trigger === 'low_cad')   update.lastCadCoachTs  = now;
    if (trigger === 'high_imp')    update.lastImpCoachTs    = now;
    if (trigger === 'high_fat')    update.lastFatCoachTs    = now;
    if (trigger === 'z5')          update.lastZ5CoachTs     = now;
    if (trigger === 'heel_strike') update.lastStrikeCoachTs = now;
    if (trigger === 'overpronation') update.lastPronCoachTs = now;
    if (trigger.startsWith('km_')) {
      update.lastKmCoached = parseInt(trigger.split('_')[1], 10);
    }
    set(update as Partial<RunState>);
  },
}));
