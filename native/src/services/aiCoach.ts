import Tts from 'react-native-tts';
import { loadSettings, appendCoachEvent, CoachEvent } from './storage';
import { formatPace, formatTime } from '../algorithms/gps';
import { RUNNER } from '../constants/runner';
import { RunState } from '../store/runStore';

const MODEL = 'claude-sonnet-4-6';

// Check if a trigger should fire and build the trigger string.
// Returns null if conditions not met.
export function checkTrigger(s: RunState): string | null {
  const now   = Date.now();
  const el    = s.elapsedSecs;
  const dist  = s.dist;
  const hr    = s.hr;
  const zone  = s.hrZone;
  const pace  = s.displayPace;
  const tgt   = s.runConfig.targetPace;
  const diff  = tgt > 0 ? pace - tgt : 0;
  const fat   = s.fatigueTotal;
  const cad   = s.cadence;
  const imp   = s.impact;

  // Run start (fire once at 3s) — 5s cooldown guards against double-fire from
  // simultaneous GPS task + BackgroundTimer calls at the same elapsed second.
  if (el === 3 && (now - s.lastCoachTs) > 5000) return 'run_start';

  // 2-min check-in every 120s — same double-fire guard
  if (el > 0 && el % 120 === 0 && (now - s.lastCoachTs) > 5000) return '2min_checkin';

  // km milestones
  const km = Math.floor(dist);
  if (km > 0 && km > s.lastKmCoached) return `km_${km}`;

  // HR zone 4 — first entry only
  if (zone === 4 && !s.hr4Coached) return 'z4_entry';

  // HR zone 5 — every 30s
  if (zone === 5 && (now - s.lastZ5CoachTs) > 30000) return 'z5';

  // Pace alerts (every 75s)
  if (tgt > 0 && diff > 20 && (now - s.lastSlowCoachTs) > 75000) return 'pace_slow';
  if (tgt > 0 && diff < -20 && (now - s.lastFastCoachTs) > 75000) return 'pace_fast';

  // Cadence (every 60s, after 30s elapsed)
  if (el > 30 && cad > 0 && cad < 165 && (now - s.lastCadCoachTs) > 60000) return 'low_cad';

  // Impact (every 90s)
  if (imp > 7.5 && (now - s.lastImpCoachTs) > 90000) return 'high_imp';

  // Fatigue (every 60s)
  if (fat > 7 && (now - s.lastFatCoachTs) > 60000) return 'high_fat';

  // Heel strike (>60% of classified steps, every 90s, after 30s elapsed)
  if (el > 30 && s.strikeHeel > 0 && (now - s.lastStrikeCoachTs) > 90000) {
    const total = s.strikeHeel + s.strikeMid + s.strikeFore;
    if (total > 0 && s.strikeHeel / total > 0.6) return 'heel_strike';
  }

  // Overpronation (>50% of classified steps, every 90s, after 30s elapsed)
  if (el > 30 && s.pronOver > 0 && (now - s.lastPronCoachTs) > 90000) {
    const total = s.pronNeutral + s.pronOver + s.pronRigid;
    if (total > 0 && s.pronOver / total > 0.5) return 'overpronation';
  }

  return null;
}

function buildPrompt(trigger: string, s: RunState): string {
  const cfg    = s.runConfig;
  const remain = cfg.targetDist > 0 ? Math.max(0, cfg.targetDist - s.dist) : null;
  const diff   = cfg.targetPace > 0 ? s.displayPace - cfg.targetPace : 0;
  const hrPct  = Math.round((s.hr / RUNNER.maxHR) * 100);

  const STRIKE_NAME  = ['midfoot', 'heel', 'forefoot'];
  const PRON_NAME    = ['neutral', 'overpronation', 'rigid/supination'];
  const strikeTxt  = s.strikeCode    >= 0 ? STRIKE_NAME[s.strikeCode]  : null;
  const pronTxt    = s.pronationCode >= 0 ? PRON_NAME[s.pronationCode] : null;
  const strikeCtx  = strikeTxt
    ? `\n- Strike pattern: ${strikeTxt} | Pronation: ${pronTxt ?? 'unknown'}`
    : '';

  return `You are a real-time running coach for ${RUNNER.name} in ${RUNNER.location}.

Runner profile:
- ${RUNNER.totalRuns} runs, ${RUNNER.totalKm}km total, marathon finisher (Jan 2026)
- Max HR ${RUNNER.maxHR}bpm, resting HR ${RUNNER.restingHR}bpm
- Baseline cadence ${RUNNER.baseCadence}spm, GCT ${RUNNER.baseGCT}ms, impact ${RUNNER.baseImpact}G
- Conditions: ${RUNNER.conditions}

Current run context:
- Trigger: ${trigger}
- Run type: ${cfg.runType} | Weather: ${cfg.weather}
- Target: ${cfg.targetDist > 0 ? cfg.targetDist + 'km' : 'open'} @ ${cfg.targetPace > 0 ? formatPace(cfg.targetPace) + '/km' : 'no pace target'}
- Elapsed: ${formatTime(s.elapsedSecs)} | Distance: ${s.dist.toFixed(2)}km${remain !== null ? ` | Remaining: ${remain.toFixed(2)}km` : ''}
- Pace: ${formatPace(s.displayPace)}/km${diff !== 0 ? ` (${diff > 0 ? '+' : ''}${Math.round(diff)}s vs target)` : ''}
- HR: ${s.hr}bpm — Zone ${s.hrZone} — ${hrPct}% max HR
- Cadence: ${s.cadence}spm | GCT: ${s.gct}ms | Impact: ${s.impact.toFixed(2)}G${strikeCtx}
- Fatigue: ${s.fatigueTotal.toFixed(1)}/10 (HR:${s.fatigueHR.toFixed(1)} Cad:${s.fatigueCad.toFixed(1)} GCT:${s.fatigueGCT.toFixed(1)} Imp:${s.fatigueImp.toFixed(1)})

Give a concise, energetic 1–2 sentence coaching cue spoken directly to ${RUNNER.name}.
No intro phrases like "Great job" or "Keep it up" every time. Be specific to the trigger and data. Max 30 words.`;
}

export async function fireCoach(trigger: string, s: RunState): Promise<string | null> {
  const { apiKey } = await loadSettings();
  if (!apiKey) return null;

  const prompt = buildPrompt(trigger, s);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 100,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? null;

    if (text) {
      const ev: CoachEvent = {
        runId:          s.runId,
        runDate:        s.runDate,
        runTime:        s.runTime,
        runType:        s.runConfig.runType,
        weather:        s.runConfig.weather,
        targetDist:     s.runConfig.targetDist,
        targetPace:     s.runConfig.targetPace,
        trigger,
        adviceType:     trigger,
        elapsedSecs:    s.elapsedSecs,
        elapsedDisplay: formatTime(s.elapsedSecs),
        distKm:         s.dist,
        paceDisplay:    formatPace(s.displayPace),
        paceDiffSecs:   s.runConfig.targetPace > 0 ? s.displayPace - s.runConfig.targetPace : 0,
        hr:             s.hr,
        hrZone:         s.hrZone,
        cadence:        s.cadence,
        gct:            s.gct,
        impact:         s.impact,
        fatigueTotal:   s.fatigueTotal,
        fatigueHR:      s.fatigueHR,
        fatigueCad:     s.fatigueCad,
        fatigueGCT:     s.fatigueGCT,
        fatigueImp:     s.fatigueImp,
        aiResponse:     text,
      };
      await appendCoachEvent(ev);
    }

    return text;
  } catch {
    return null;
  }
}

// Initialise TTS engine once at app start.
// Audio ducking: Android's AudioManager requests AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
// which tells Spotify / music apps to lower volume while coaching plays,
// then restore automatically when TTS finishes.
export function initTTS(): void {
  Tts.getInitStatus().then(() => {
    Tts.setDefaultRate(0.85);   // slightly below normal — clear for outdoor use
    Tts.setDefaultPitch(1.0);
    Tts.setDucking(true);       // enables audio ducking on Android
  }).catch(() => {
    // TTS engine not available — coaching will silently skip
  });
}

export function speak(text: string, onDone?: () => void): void {
  Tts.stop();

  if (onDone) {
    // Guard against double-call (tts-finish + safety timeout firing close together)
    let called = false;
    const done = () => {
      if (called) return;
      called = true;
      finishSub.remove();
      errSub.remove();
      cancelSub.remove();
      clearTimeout(safety);
      onDone();
    };
    const finishSub  = Tts.addEventListener('tts-finish', done);
    const errSub     = Tts.addEventListener('tts-error',  done);
    // tts-cancel fires when speech is interrupted (phone call, audio focus loss,
    // Tts.stop() call) — without this handler isSpeaking stays true forever.
    const cancelSub  = Tts.addEventListener('tts-cancel', done);
    // Safety net: if no TTS event fires within 30s, reset isSpeaking anyway.
    const safety     = setTimeout(done, 30_000);
  }

  // STREAM_MUSIC routes audio through the music stream so ducking applies
  // to whatever is playing (Spotify, YouTube Music, etc.)
  Tts.speak(text, {
    androidParams: {
      KEY_PARAM_STREAM:  'STREAM_MUSIC',
      KEY_PARAM_VOLUME:  1.0,
      KEY_PARAM_PAN:     0,
    },
  });
}

export function stopSpeech(): void {
  Tts.stop();
}
