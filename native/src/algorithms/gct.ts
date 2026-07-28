// ─── GCT plausibility validation ──────────────────────────────────────────────
// Ground-contact time (GCT) is driven by the pace you are *currently* running,
// not by fitness — an elite on an easy jog has the same long GCT as anyone else
// at that pace. Published force-plate norms give a tight pace→GCT relationship:
//
//     ~3:00 /km (elite race pace)   → 150–200 ms
//     ~4:00–5:00 /km (trained)      → 200–250 ms
//     ~6:00–7:30 /km (easy jog)     → 250–300+ ms
//
// The foot pod's GCT has been unreliable (false ~100 ms early-exits and 600 ms
// detection timeouts). GPS pace, by contrast, is independent and accurate, so
// it is a reliable cross-check: any GCT outside the plausible window for the
// current pace is physically impossible and can be rejected before it reaches
// the fatigue index or the coach. This is a self-validating-sensor filter — it
// catches bad readings without needing per-run threshold tuning in firmware.

// Plausible [min, max] GCT window (ms) for a running pace given in seconds/km.
export function plausibleGctRange(paceSecPerKm: number): { min: number; max: number } {
  // Pace unavailable (standing still, GPS not yet locked) → widest sane window,
  // so a momentarily-unknown pace never causes a GCT to be wrongly rejected.
  if (!paceSecPerKm || paceSecPerKm <= 0) return { min: 120, max: 480 };

  // Model is defined over 3:00–8:00 /km; clamp beyond that range.
  const p = Math.min(Math.max(paceSecPerKm, 180), 480);

  // Centre rises linearly ~175 ms at 3:00/km → ~300 ms at 7:30/km
  // (≈0.46 ms per extra second-per-km).
  const center = 175 + (p - 180) * 0.46;

  // ±45% band absorbs individual variation and sensor noise. The goal is to
  // catch clearly-impossible values, not to tune tightly to one runner.
  return {
    min: Math.max(120, Math.round(center * 0.55)),
    max: Math.min(480, Math.round(center * 1.45)),
  };
}

// True if `gct` (ms) is physically plausible for `paceSecPerKm`.
export function isGctPlausible(gct: number, paceSecPerKm: number): boolean {
  if (gct <= 0) return false;
  const { min, max } = plausibleGctRange(paceSecPerKm);
  return gct >= min && gct <= max;
}
