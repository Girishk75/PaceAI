import { HR_ZONES, RUNNER } from '../constants/runner';

export function getHRZone(hr: number): number {
  for (const z of [...HR_ZONES].reverse()) {
    if (hr >= z.min) return z.zone;
  }
  return 1;
}

export function hrPct(hr: number): number {
  return Math.round((hr / RUNNER.maxHR) * 100);
}

// Simulated HR when Garmin not connected
export function simHR(elapsedSecs: number, runType: string): number {
  const base = runType === 'easy' ? 135 : runType === 'tempo' ? 155 : 145;
  const drift = Math.min(20, elapsedSecs / 120);
  return Math.round(base + drift + (Math.random() - 0.5) * 4);
}
