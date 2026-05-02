import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const LAST_LOG_KEY = 'paceai_last_debug_log_path';

// Unbounded accumulator for the current run — never evicted, written to disk
// every 30 s so logs survive app crashes / Android process termination.
const allLines: string[] = [];
let currentRunId  = '';
let flushing      = false;

export function initDebugLog(runId: string): void {
  allLines.length = 0;
  currentRunId    = runId;
}

export function addDebugLine(line: string): void {
  allLines.push(line);
}

function logPath(): string {
  return `${FileSystem.documentDirectory}paceai_debug_${currentRunId}.log`;
}

export async function flushDebugLog(): Promise<void> {
  if (!currentRunId || allLines.length === 0 || flushing) return;
  flushing = true;
  try {
    const text = allLines.join('\n') + '\n';
    await FileSystem.writeAsStringAsync(logPath(), text, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    // Persist path for cross-session access (Settings screen, post-run share)
    await AsyncStorage.setItem(LAST_LOG_KEY, logPath());
  } catch {}
  flushing = false;
}

// Share the live log for the current run (flushes first).
export async function shareDebugLog(): Promise<void> {
  await flushDebugLog();
  const path = logPath();
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'text/plain', dialogTitle: 'PaceAI Debug Log' });
  }
}

// Share the most recent saved log — works after the run ends and across sessions.
export async function shareLastDebugLog(): Promise<void> {
  // If a run is active, share its live log
  if (currentRunId) { await shareDebugLog(); return; }
  // Otherwise find the last persisted log
  const path = await AsyncStorage.getItem(LAST_LOG_KEY);
  if (!path) return;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'text/plain', dialogTitle: 'PaceAI Debug Log' });
  }
}
