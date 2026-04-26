// Composite fatigue index 0–10
// Cadence component is zero for first 30s (prevents phantom fatigue from stationary pod)
export function calcFatigue(
  hr: number,
  cadence: number,
  gct: number,
  impact: number,
  elapsedSecs: number,
): { total: number; hr: number; cad: number; gct: number; imp: number } {
  const compHR  = Math.max(0, (hr - 143) / 20) * 3.5;
  const compCad = elapsedSecs < 30 ? 0 : Math.max(0, 172 - cadence) * 0.6;
  const compGCT = Math.max(0, gct - 245) * 0.05;
  const compImp = Math.max(0, impact - 5.5) * 4;

  const total = compHR * 0.35 + compCad * 0.25 + compGCT * 0.20 + compImp * 0.20;

  return {
    total: Math.min(10, total),
    hr:    compHR,
    cad:   compCad,
    gct:   compGCT,
    imp:   compImp,
  };
}
