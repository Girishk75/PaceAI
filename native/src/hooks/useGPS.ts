import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { PaceSmoother, haversineMetres } from '../algorithms/gps';
import { useRunStore } from '../store/runStore';

const BACKGROUND_TASK = 'paceai-location';
const ACCURACY_THRESH = 150; // metres — relaxed for Mumbai urban

// Pre-warm: get a fast initial fix
export async function prewarmGPS(): Promise<void> {
  await Location.requestForegroundPermissionsAsync();
  await Location.requestBackgroundPermissionsAsync();
  await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
}

// Register background location task (must be called at module level)
TaskManager.defineTask(BACKGROUND_TASK, ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;
  // Background location updates are handled via the same store reference
  // We emit a custom event that the foreground hook picks up
});

export function useGPS() {
  const updateGPS = useRunStore(s => s.updateGPS);
  const running   = useRunStore(s => s.running);

  const smoother   = useRef(new PaceSmoother());
  const lastPos    = useRef<{ lat: number; lon: number } | null>(null);
  const totalDistM = useRef(0);
  const watcher    = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!running) {
      watcher.current?.remove();
      watcher.current = null;
      return;
    }

    smoother.current.reset();
    lastPos.current    = null;
    totalDistM.current = 0;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      watcher.current = await Location.watchPositionAsync(
        {
          accuracy:           Location.Accuracy.BestForNavigation,
          timeInterval:       1000,
          distanceInterval:   1,
        },
        (loc) => {
          const { latitude: lat, longitude: lon, accuracy, speed } = loc.coords;
          if ((accuracy ?? 999) > ACCURACY_THRESH) return;

          const t = loc.timestamp;

          // Accumulate distance
          if (lastPos.current) {
            const d = haversineMetres(lastPos.current.lat, lastPos.current.lon, lat, lon);
            if (d >= 3) {
              totalDistM.current += d;
              lastPos.current = { lat, lon };
            }
          } else {
            lastPos.current = { lat, lon };
          }

          // Smooth pace via sliding window
          const pace = smoother.current.update(lat, lon, t);

          if (pace) {
            updateGPS(pace, totalDistM.current / 1000, accuracy ?? 999);
          }
        },
      );
    })();

    return () => {
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [running, updateGPS]);
}
