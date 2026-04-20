const R = 6371000; // Earth radius in metres

export function haversineMetres(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Sliding 5-position haversine window for pace smoothing
export class PaceSmoother {
  private buf: Array<{ lat: number; lon: number; t: number }> = [];
  private readonly WIN = 5;
  private readonly MIN_MOVE_M = 3;
  private readonly PACE_MIN = 210;   // 3:30/km
  private readonly PACE_MAX = 900;   // 15:00/km

  update(lat: number, lon: number, t: number): number | null {
    const last = this.buf[this.buf.length - 1];
    if (last) {
      const dist = haversineMetres(last.lat, last.lon, lat, lon);
      if (dist < this.MIN_MOVE_M) return null; // too little movement
    }
    this.buf.push({ lat, lon, t });
    if (this.buf.length > this.WIN) this.buf.shift();
    if (this.buf.length < 2) return null;

    const first = this.buf[0];
    const distM = haversineMetres(first.lat, first.lon, lat, lon);
    const dtSec = (t - first.t) / 1000;
    if (distM < 1 || dtSec < 1) return null;

    const pace = dtSec / (distM / 1000); // sec/km
    if (pace < this.PACE_MIN || pace > this.PACE_MAX) return null;
    return pace;
  }

  reset() { this.buf = []; }
}

export function formatPace(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
