import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import BackgroundTimer from 'react-native-background-timer';
import { PaceSmoother, haversineMetres } from '../algorithms/gps';
import { useRunStore } from '../store/runStore';
// useRunStore is also used at module level (inside the TaskManager task) so the
// import must be at the top — not inside the hook function.

const TASK_NAME      = 'paceai-background-location';
const ACCURACY_THRESH = 150; // metres — relaxed for Mumbai urban (pace smoother input)

// ── Distance accumulation gates (B13) ─────────────────────────────────────────
// 2026-07-18 run: PaceAI recorded 12.14 km vs Garmin 10.0 km (~20% over). The
// pace smoother matched Garmin, so the error was purely in the odometer: at
// 1 Hz, urban GPS jitter ≥ 3 m per fix was summed as real movement. Distance
// therefore uses much stricter gates than pace:
//   accuracy gate  — poor fixes never move the odometer
//   min step       — movement must exceed the fix's own noise radius
//   speed gate     — an implied speed no runner reaches is a GPS jump, not motion
const DIST_ACC_M    = 35;   // metres — worst fix accuracy the odometer will trust
const MAX_RUN_SPEED = 6.5;  // m/s (~2:34/km) — above this the "movement" is a jump

// Location-service options — shared by the initial start and the watchdog restart.
const LOCATION_OPTIONS = {
  accuracy:            Location.Accuracy.BestForNavigation,
  timeInterval:        1000,   // request update every 1s
  distanceInterval:    1,      // also trigger on any movement ≥ 1m
  foregroundService: {
    notificationTitle: 'PaceAI Running',
    notificationBody:  'GPS tracking active — screen can be locked',
    notificationColor: '#00ffa3',
  },
  activityType:                     Location.ActivityType.Fitness,
  pausesUpdatesAutomatically:       false,
  showsBackgroundLocationIndicator: true,
};

// GPS watchdog state. Some Android OEMs (notably OnePlus/OxygenOS) kill the
// location foreground service mid-run even with battery optimisation off
// (2026-09-26: GPS died ~20 min into a 14 km run, distance then estimated from
// pace and came up ~9% short vs Garmin). If no fix arrives for GPS_STALE_MS
// while running, the watchdog restarts location updates.
const GPS_STALE_MS = 90_000;
let lastGpsFixMs = 0;                                       // wall-clock of the last delivered fix
let gpsWatchdog: number | null = null;

// ─── Background task definition (must be at module level, outside components) ──
// expo-location's startLocationUpdatesAsync automatically creates an Android
// ForegroundService with a persistent notification — free, no license needed.
// This keeps GPS alive when the screen is locked.
//
// tick() is driven from here so the run timer stays accurate even when Android
// throttles BackgroundTimer in the JS thread (Doze mode, screen locked).
// The GPS foreground service is battery-exempt so this callback always fires.
TaskManager.defineTask(TASK_NAME, ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;
  lastGpsFixMs = Date.now();   // record every delivered fix — the watchdog reads this
  const loc: Location.LocationObject = data.locations[data.locations.length - 1];
  // Drive the run timer — wall-clock based tick() is idempotent so calling
  // it from both here and BackgroundTimer is safe (no double-counting).
  const store = useRunStore.getState();
  if (store.running) store.tick();
  // Forward GPS data via module-level ref updated by the hook
  gpsCallback?.(loc);
});

// Module-level callback — updated by the hook so the task can reach the store
let gpsCallback: ((loc: Location.LocationObject) => void) | null = null;

// Debug-only: append one line per raw GPS fix with its inputs and the distance
// gate's decision. `reason` is count | skip:acc | skip:minstep | skip:speed |
// skip:acc>NNN. Coordinates at 6 dp (~0.1 m) so the raw track can be replayed.
function logGpsFix(
  lat: number, lon: number, acc: number,
  d: number, spd: number, reason: string, totalM: number,
): void {
  const el = useRunStore.getState().elapsedSecs;
  useRunStore.getState().appendLog(
    `[GPS] t=${el}s lat=${lat.toFixed(6)} lon=${lon.toFixed(6)} acc=${acc.toFixed(0)}m ` +
    `d=${d.toFixed(1)}m spd=${spd.toFixed(1)}m/s ${reason} total=${(totalM / 1000).toFixed(3)}km`,
  );
}

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
  const lastPosTs   = useRef(0);
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
    lastPosTs.current  = 0;
    totalDistM.current = 0;

    // Wire the module-level callback to this run's store/smoother state
    gpsCallback = (loc: Location.LocationObject) => {
      const { latitude: lat, longitude: lon, accuracy } = loc.coords;
      const t   = loc.timestamp;
      const acc = accuracy ?? 999;
      const dbg = useRunStore.getState().debugMode;

      // Pace-smoother accuracy gate (unchanged). Log the drop in debug mode so
      // the raw fix stream is complete for offline replay/tuning vs Garmin.
      if (acc > ACCURACY_THRESH) {
        if (dbg) logGpsFix(lat, lon, acc, 0, 0, `skip:acc>${ACCURACY_THRESH}`, totalDistM.current);
        return;
      }

      let d = 0, spd = 0, counted = false;
      if (lastPos.current) {
        d = haversineMetres(lastPos.current.lat, lastPos.current.lon, lat, lon);
        // Movement must exceed the fix's own noise radius before it counts.
        // Jitter smaller than minStep never moves the anchor, so real slow
        // movement still accumulates once it adds up past the threshold.
        const minStep = Math.max(8, acc * 0.5);
        if (acc <= DIST_ACC_M && d >= minStep) {
          const dt = Math.max((t - lastPosTs.current) / 1000, 1);
          spd = d / dt;
          if (spd <= MAX_RUN_SPEED) { totalDistM.current += d; counted = true; }
          // Re-anchor even when the speed gate rejects the movement — a jump
          // must not be re-measured against the old anchor and added later.
          lastPos.current   = { lat, lon };
          lastPosTs.current = t;
        }
      } else if (acc <= DIST_ACC_M) {
        // First anchor also requires a good fix — anchoring on a 100 m-error
        // point would poison the first delta.
        lastPos.current   = { lat, lon };
        lastPosTs.current = t;
      }

      // Raw-fix debug log: every fix with its inputs + the gate's decision.
      // Enables replaying the distance gates offline against a reference
      // (e.g. a Garmin FIT track) instead of needing a fresh run per tweak.
      if (dbg) {
        const reason = counted ? 'count'
          : acc > DIST_ACC_M                  ? 'skip:acc'
          : d < Math.max(8, acc * 0.5)        ? 'skip:minstep'
          :                                     'skip:speed';
        logGpsFix(lat, lon, acc, d, spd, reason, totalDistM.current);
      }

      const pace = smoother.current.update(lat, lon, t);
      if (pace) {
        updateGPS(pace, totalDistM.current / 1000, acc);
      }
    };

    // Start background location with ForegroundService notification.
    // Android shows a persistent notification ("PaceAI — GPS tracking active")
    // — this is what keeps the process alive when screen locks.
    lastGpsFixMs = Date.now();   // seed so the watchdog waits for the first fix
    Location.startLocationUpdatesAsync(TASK_NAME, LOCATION_OPTIONS)
      .catch(err => console.warn('GPS start error:', err));

    // GPS watchdog — restart location updates if the OS silently kills them
    // mid-run (see LOCATION_OPTIONS note). BackgroundTimer keeps firing while
    // backgrounded (the coach loop proves it), unlike a plain setInterval.
    gpsWatchdog = BackgroundTimer.setInterval(() => {
      if (!useRunStore.getState().running || lastGpsFixMs === 0) return;
      if (Date.now() - lastGpsFixMs > GPS_STALE_MS) {
        useRunStore.getState().appendLog(
          `[GPS] no fix for ${GPS_STALE_MS / 1000}s — restarting location updates`,
        );
        Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {}).then(() => {
          Location.startLocationUpdatesAsync(TASK_NAME, LOCATION_OPTIONS).catch(() => {});
        });
        lastGpsFixMs = Date.now();   // reset so we don't restart again before it recovers
      }
    }, 30_000);

    return () => {
      Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {});
      if (gpsWatchdog !== null) { BackgroundTimer.clearInterval(gpsWatchdog); gpsWatchdog = null; }
      gpsCallback = null;
    };
  }, [running, updateGPS]);
}
