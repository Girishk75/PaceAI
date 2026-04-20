import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { PaceSmoother, haversineMetres } from '../algorithms/gps';
import { useRunStore } from '../store/runStore';

const TASK_NAME      = 'paceai-background-location';
const ACCURACY_THRESH = 150; // metres — relaxed for Mumbai urban

// ─── Background task definition (must be at module level, outside components) ──
// expo-location's startLocationUpdatesAsync automatically creates an Android
// ForegroundService with a persistent notification — free, no license needed.
// This keeps GPS alive when the screen is locked.
TaskManager.defineTask(TASK_NAME, ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;
  const loc: Location.LocationObject = data.locations[data.locations.length - 1];
  // Forward to store via a module-level ref updated by the hook
  gpsCallback?.(loc);
});

// Module-level callback — updated by the hook so the task can reach the store
let gpsCallback: ((loc: Location.LocationObject) => void) | null = null;

// ─── One-time permission pre-warm ──────────────────────────────────────────────
export async function prewarmGPS(): Promise<void> {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return;
  await Location.requestBackgroundPermissionsAsync();
  // Fast initial fix to seed the GPS chip
  await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  }).catch(() => {});
}

// ─── Hook used by LiveRunScreen ────────────────────────────────────────────────
export function useGPS() {
  const updateGPS = useRunStore(s => s.updateGPS);
  const running   = useRunStore(s => s.running);

  const smoother    = useRef(new PaceSmoother());
  const lastPos     = useRef<{ lat: number; lon: number } | null>(null);
  const totalDistM  = useRef(0);

  useEffect(() => {
    if (!running) {
      // Stop background task and clear callback
      Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {});
      gpsCallback = null;
      return;
    }

    smoother.current.reset();
    lastPos.current    = null;
    totalDistM.current = 0;

    // Wire the module-level callback to this run's store/smoother state
    gpsCallback = (loc: Location.LocationObject) => {
      const { latitude: lat, longitude: lon, accuracy } = loc.coords;
      if ((accuracy ?? 999) > ACCURACY_THRESH) return;

      const t = loc.timestamp;

      if (lastPos.current) {
        const d = haversineMetres(lastPos.current.lat, lastPos.current.lon, lat, lon);
        if (d >= 3) {
          totalDistM.current += d;
          lastPos.current = { lat, lon };
        }
      } else {
        lastPos.current = { lat, lon };
      }

      const pace = smoother.current.update(lat, lon, t);
      if (pace) {
        updateGPS(pace, totalDistM.current / 1000, accuracy ?? 999);
      }
    };

    // Start background location with ForegroundService notification.
    // Android shows a persistent notification ("PaceAI — GPS tracking active")
    // — this is what keeps the process alive when screen locks.
    Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy:            Location.Accuracy.BestForNavigation,
      timeInterval:        1000,   // request update every 1s
      distanceInterval:    1,      // also trigger on any movement ≥ 1m
      foregroundService: {
        notificationTitle: 'PaceAI Running',
        notificationBody:  'GPS tracking active — screen can be locked',
        notificationColor: '#00ffa3',
      },
      activityType:                        Location.ActivityType.Fitness,
      pausesUpdatesAutomatically:          false,
      showsBackgroundLocationIndicator:    true,
    }).catch(err => console.warn('GPS start error:', err));

    return () => {
      Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {});
      gpsCallback = null;
    };
  }, [running, updateGPS]);
}
