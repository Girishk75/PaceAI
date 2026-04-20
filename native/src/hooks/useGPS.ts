import { useEffect, useRef } from 'react';
import BackgroundGeolocation, {
  Location,
  Subscription,
} from 'react-native-background-geolocation';
import { PaceSmoother, haversineMetres } from '../algorithms/gps';
import { useRunStore } from '../store/runStore';

const ACCURACY_THRESH = 150; // metres — relaxed for Mumbai urban

// Call once at app startup (before any run) to configure the plugin.
// react-native-background-geolocation creates an Android ForegroundService
// automatically — this is what keeps GPS alive when screen is locked.
export async function initBackgroundGPS(): Promise<void> {
  await BackgroundGeolocation.ready({
    // Accuracy
    desiredAccuracy:      BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
    distanceFilter:       3,      // minimum metres between updates (matches PWA)
    locationUpdateInterval: 1000, // Android: request update every 1s

    // Background / Foreground Service
    stopOnTerminate:  false,
    startOnBoot:      false,
    foregroundService: true,      // Android: keeps process alive when screen locked
    notification: {
      title: 'PaceAI Running',
      text:  'GPS tracking active',
      sticky: true,
    },

    // Permissions
    locationAuthorizationRequest: 'Always',

    // Battery / accuracy tuning
    pausesLocationUpdatesAutomatically: false,
    preventSuspend:   true,
    heartbeatInterval: 60,

    // Debug off for production
    debug:    false,
    logLevel: BackgroundGeolocation.LOG_LEVEL_OFF,
  });
}

export function useGPS() {
  const updateGPS   = useRunStore(s => s.updateGPS);
  const running     = useRunStore(s => s.running);

  const smoother    = useRef(new PaceSmoother());
  const lastPos     = useRef<{ lat: number; lon: number } | null>(null);
  const totalDistM  = useRef(0);
  const locSub      = useRef<Subscription | null>(null);

  useEffect(() => {
    if (!running) {
      BackgroundGeolocation.stop();
      locSub.current?.remove();
      locSub.current = null;
      return;
    }

    // Reset per-run state
    smoother.current.reset();
    lastPos.current   = null;
    totalDistM.current = 0;

    // Subscribe to location updates
    locSub.current = BackgroundGeolocation.onLocation(
      (loc: Location) => {
        const { latitude: lat, longitude: lon, accuracy } = loc.coords;
        if ((accuracy ?? 999) > ACCURACY_THRESH) return;

        const t = new Date(loc.timestamp).getTime();

        // Accumulate haversine distance
        if (lastPos.current) {
          const d = haversineMetres(lastPos.current.lat, lastPos.current.lon, lat, lon);
          if (d >= 3) {
            totalDistM.current += d;
            lastPos.current = { lat, lon };
          }
        } else {
          lastPos.current = { lat, lon };
        }

        // Smooth pace via sliding 5-position window
        const pace = smoother.current.update(lat, lon, t);
        if (pace) {
          updateGPS(pace, totalDistM.current / 1000, accuracy ?? 999);
        }
      },
      (error) => {
        console.warn('GPS error:', error);
      },
    );

    BackgroundGeolocation.start();

    return () => {
      locSub.current?.remove();
      locSub.current = null;
      BackgroundGeolocation.stop();
    };
  }, [running, updateGPS]);
}
