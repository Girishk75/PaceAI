export const RUNNER = {
  name:          'Girish',
  location:      'Mumbai, India',
  totalRuns:     323,
  totalKm:       3043,
  longestRun:    'Full Marathon (Jan 2026)',
  maxHR:         185,
  restingHR:     65,
  baseCadence:   172,
  baseGCT:       245,
  baseImpact:    2.1,
  conditions:    'Warm & humid (Mumbai mornings)',
  watch:         'Garmin Forerunner 245',
} as const;

export const HR_ZONES = [
  { zone: 1, label: 'Recovery',  min: 0,                       max: Math.round(RUNNER.maxHR * 0.60) },
  { zone: 2, label: 'Aerobic',   min: Math.round(RUNNER.maxHR * 0.60), max: Math.round(RUNNER.maxHR * 0.70) },
  { zone: 3, label: 'Tempo',     min: Math.round(RUNNER.maxHR * 0.70), max: Math.round(RUNNER.maxHR * 0.80) },
  { zone: 4, label: 'Threshold', min: Math.round(RUNNER.maxHR * 0.80), max: Math.round(RUNNER.maxHR * 0.90) },
  { zone: 5, label: 'Max',       min: Math.round(RUNNER.maxHR * 0.90), max: 999 },
] as const;

export const RUN_TYPES = ['easy', 'tempo', 'long', 'race', 'intervals'] as const;
export type RunType = typeof RUN_TYPES[number];

export const WEATHER_OPTIONS = ['sunny', 'cloudy', 'humid', 'windy', 'rainy', 'cool'] as const;
export type Weather = typeof WEATHER_OPTIONS[number];
