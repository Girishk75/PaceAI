import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const RUNS_KEY       = 'paceai_runs_v1';
const COACH_LOG_KEY  = 'paceai_coach_log_v1';
const SETTINGS_KEY   = 'paceai_settings_v1';

// ── Run records ────────────────────────────────────────────────────────────

export interface RunRecord {
  runId:       string;
  runDate:     string;
  runTime:     string;
  runType:     string;
  weather:     string;
  targetDist:  number;
  targetPace:  number;
  elapsedSecs: number;
  distKm:      number;
  avgPace:     number;
  avgHR:       number;
  maxHR:       number;
  steps:       number;
  avgCadence:  number;
  avgImpact:   number;
  avgGCT:      number;
  avgFatigue:  number;
  peakFatigue: number;
}

export async function saveRun(rec: RunRecord): Promise<void> {
  const raw  = await AsyncStorage.getItem(RUNS_KEY);
  const runs = raw ? JSON.parse(raw) as RunRecord[] : [];
  runs.unshift(rec);
  await AsyncStorage.setItem(RUNS_KEY, JSON.stringify(runs));
}

export async function loadRuns(): Promise<RunRecord[]> {
  const raw = await AsyncStorage.getItem(RUNS_KEY);
  return raw ? JSON.parse(raw) : [];
}

// ── Coach log ──────────────────────────────────────────────────────────────

export interface CoachEvent {
  runId:        string;
  runDate:      string;
  runTime:      string;
  runType:      string;
  weather:      string;
  targetDist:   number;
  targetPace:   number;
  trigger:      string;
  adviceType:   string;
  elapsedSecs:  number;
  elapsedDisplay: string;
  distKm:       number;
  paceDisplay:  string;
  paceDiffSecs: number;
  hr:           number;
  hrZone:       number;
  cadence:      number;
  gct:          number;
  impact:       number;
  fatigueTotal: number;
  fatigueHR:    number;
  fatigueCad:   number;
  fatigueGCT:   number;
  fatigueImp:   number;
  aiResponse:   string;
}

export async function appendCoachEvent(ev: CoachEvent): Promise<void> {
  const raw    = await AsyncStorage.getItem(COACH_LOG_KEY);
  const events = raw ? JSON.parse(raw) as CoachEvent[] : [];
  events.push(ev);
  await AsyncStorage.setItem(COACH_LOG_KEY, JSON.stringify(events));
}

export async function loadCoachLog(): Promise<CoachEvent[]> {
  const raw = await AsyncStorage.getItem(COACH_LOG_KEY);
  return raw ? JSON.parse(raw) : [];
}

// ── Settings ───────────────────────────────────────────────────────────────

export interface Settings {
  apiKey:       string;
  hrDeviceId:   string;
  hrDeviceName: string;
  fpDeviceId:   string;
  fpDeviceName: string;
}

const SETTINGS_DEFAULTS: Settings = {
  apiKey: '', hrDeviceId: '', hrDeviceName: '', fpDeviceId: '', fpDeviceName: '',
};

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return raw ? { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) } : { ...SETTINGS_DEFAULTS };
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ── CSV export helpers ─────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines   = rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
  return [headers.join(','), ...lines].join('\n');
}

export async function shareCSV(filename: string, rows: Record<string, unknown>[]): Promise<void> {
  const csv  = toCSV(rows);
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: `Export ${filename}` });
}
