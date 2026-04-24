import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, Animated, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackgroundTimer from 'react-native-background-timer';
import * as KeepAwake from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { useRunStore } from '../store/runStore';
import { C, F } from '../theme';
import { formatTime, formatPace } from '../algorithms/gps';
import { RUNNER } from '../constants/runner';
import { useGPS } from '../hooks/useGPS';
import { checkTrigger, fireCoach, speak, stopSpeech } from '../services/aiCoach';
import { DebugOverlay } from '../components/DebugOverlay';

const { width: W } = Dimensions.get('window');

const ZONE_COLOR = ['', '#00c8ff', '#00ffa3', '#ffb700', '#ff8c00', '#ff4560'];
const ZONE_LABEL = ['', 'Recovery', 'Aerobic', 'Tempo', 'Threshold', 'Max'];
const PAGE_LABELS = ['ESSENTIALS', 'BODY', 'POD', 'COACH'];

export function LiveRunScreen() {
  const s           = useRunStore();
  const pauseRun    = useRunStore(st => st.pauseRun);
  const endRun      = useRunStore(st => st.endRun);
  const setScreen   = useRunStore(st => st.setScreen);
  const tick        = useRunStore(st => st.tick);
  const markCoach   = useRunStore(st => st.markCoach);
  const setMuted    = useRunStore(st => st.setMuted);
  const setSpeaking = useRunStore(st => st.setSpeaking);

  const [activePage, setActivePage] = useState(0);
  const [lastMsg, setLastMsg]       = useState('Coaching will appear here during your run.');
  const storeRef   = useRef(useRunStore.getState());
  const timerRef   = useRef<number | null>(null);
  const scrollRef  = useRef<ScrollView>(null);

  // Zone color drives accent across all pages
  const zoneColor = ZONE_COLOR[s.hrZone] || C.blue;

  useGPS();

  useEffect(() => {
    const unsub = useRunStore.subscribe(st => { storeRef.current = st; });
    return unsub;
  }, []);

  // Wake lock + immersive
  useEffect(() => {
    KeepAwake.activateKeepAwakeAsync();
    NavigationBar.setVisibilityAsync('hidden');
    return () => {
      KeepAwake.deactivateKeepAwake();
      NavigationBar.setVisibilityAsync('visible');
    };
  }, []);

  // Background-safe 1Hz tick + coach
  useEffect(() => {
    timerRef.current = BackgroundTimer.setInterval(async () => {
      const st = storeRef.current;
      if (!st.running) return;
      st.tick();

      if (st.coachMuted || st.isSpeaking) return;
      const trigger = checkTrigger(storeRef.current);
      if (!trigger) return;

      st.markCoach(trigger);
      const text = await fireCoach(trigger, storeRef.current);
      if (text) {
        setLastMsg(text);
        st.setSpeaking(true);
        speak(text, () => st.setSpeaking(false));
      }
    }, 1000);

    return () => {
      if (timerRef.current) BackgroundTimer.clearInterval(timerRef.current);
    };
  }, []);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / W);
    setActivePage(page);
  };

  const handlePause = () => {
    stopSpeech();
    KeepAwake.deactivateKeepAwake();
    pauseRun();
  };

  // Predictions
  const avgPace   = s.dist > 0 ? s.elapsedSecs / s.dist : 0;
  const remaining = s.runConfig.targetDist > 0 ? Math.max(0, s.runConfig.targetDist - s.dist) : null;
  const estFinish = remaining !== null && avgPace > 0
    ? formatTime(Math.round(s.elapsedSecs + remaining * avgPace))
    : '--:--';

  return (
    <SafeAreaView style={st.root}>

      {/* ── Slim header ── */}
      <View style={st.hdr}>
        <Text style={st.logo}>PACE<Text style={{ color: C.text }}>AI</Text></Text>

        {/* Live indicator */}
        <View style={st.livePill}>
          <LiveDot />
          <Text style={st.liveTxt}>LIVE</Text>
        </View>

        <Text style={st.pageLabel}>{PAGE_LABELS[activePage]}</Text>

        <TouchableOpacity onPress={() => { if (!s.coachMuted) stopSpeech(); setMuted(!s.coachMuted); }} style={st.iconBtn}>
          <Text style={st.iconTxt}>{s.coachMuted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      </View>

      {/* Zone color accent strip */}
      <View style={[st.zoneStrip, { backgroundColor: zoneColor }]} />

      {/* ── 4 swipeable pages ── */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={st.pager}
        scrollEventThrottle={16}
      >
        {/* PAGE 1 — Essentials */}
        <View style={st.page}>
          <View style={st.essTime}>
            <Text style={st.essClock}>{formatTime(s.elapsedSecs)}</Text>
            <Text style={st.essClockLabel}>ELAPSED</Text>
          </View>

          <View style={st.essPace}>
            <Text style={[st.essPaceVal, { color: zoneColor }]}>
              {formatPace(s.displayPace)}
            </Text>
            <Text style={st.essPaceUnit}>/km</Text>
            {s.runConfig.targetPace > 0 && (
              <PaceDelta current={s.displayPace} target={s.runConfig.targetPace} />
            )}
          </View>

          <View style={st.essDistRow}>
            <View style={st.essDistCard}>
              <Text style={st.essDistVal}>{s.dist.toFixed(2)}</Text>
              <Text style={st.essDistLabel}>
                {s.gpsPace > 0 && !s.gpsPaceStale ? `KM  GPS ±${Math.round(s.gpsAccuracy)}m` : 'KM  ⚡ SIM'}
              </Text>
            </View>
            {s.runConfig.targetDist > 0 && (
              <View style={st.essDistCard}>
                <Text style={st.essDistVal}>{remaining?.toFixed(2) ?? '--'}</Text>
                <Text style={st.essDistLabel}>KM LEFT</Text>
              </View>
            )}
          </View>
        </View>

        {/* PAGE 2 — Body */}
        <View style={st.page}>
          {/* HR big */}
          <View style={[st.hrBlock, { borderColor: zoneColor + '55' }]}>
            <Text style={[st.hrVal, { color: zoneColor }]}>
              {s.hr || '--'}
            </Text>
            <Text style={st.hrUnit}>BPM</Text>
            <View style={[st.zoneBadge, { backgroundColor: zoneColor + '22', borderColor: zoneColor }]}>
              <Text style={[st.zoneBadgeTxt, { color: zoneColor }]}>
                Z{s.hrZone}  {ZONE_LABEL[s.hrZone]}
              </Text>
            </View>
            <Text style={st.hrSub}>
              {s.hrConnected ? `BLE  ·  ${Math.round((s.hr / RUNNER.maxHR) * 100)}% max` : '⚡ Simulated'}
            </Text>
          </View>

          {/* Cadence + Fatigue */}
          <View style={st.bodyRow}>
            <View style={st.bodyCard}>
              <Text style={st.bodyCardLabel}>CADENCE</Text>
              <Text style={st.bodyCardVal}>{s.cadence || '--'}</Text>
              <Text style={st.bodyCardUnit}>{s.fpConnected ? 'spm' : '⚡ sim'}</Text>
            </View>
            <View style={st.bodyCard}>
              <Text style={st.bodyCardLabel}>FATIGUE</Text>
              <Text style={[st.bodyCardVal, {
                color: s.fatigueTotal > 7 ? C.red : s.fatigueTotal > 4 ? C.warn : C.green
              }]}>
                {s.fatigueTotal.toFixed(1)}
              </Text>
              <Text style={st.bodyCardUnit}>/ 10</Text>
            </View>
          </View>

          {/* Fatigue gauge — 10 segments */}
          <FatigueGauge value={s.fatigueTotal} />
        </View>

        {/* PAGE 3 — Pod metrics */}
        <View style={st.page}>
          {s.fpConnected ? (
            <>
              <PodMetric label="IMPACT" value={s.impact.toFixed(2)} unit="G"
                color={s.impact > 2.8 ? C.red : s.impact > 2.4 ? C.warn : C.green}
                size="large" />
              <View style={st.podRow}>
                <PodMetric label="GCT" value={`${Math.round(s.gct)}`} unit="ms"
                  color={s.gct > 280 ? C.warn : C.text} size="medium" />
                <PodMetric label="STEPS" value={`${s.steps}`} unit="total"
                  color={C.text} size="medium" />
              </View>
              <PodMetric label="CADENCE" value={`${s.cadence}`} unit="spm"
                color={s.cadence > 0 && s.cadence < 165 ? C.warn : C.green}
                size="medium" />
            </>
          ) : (
            <View style={st.podSim}>
              <Text style={st.podSimIcon}>⚡</Text>
              <Text style={st.podSimTitle}>FOOT POD NOT CONNECTED</Text>
              <Text style={st.podSimSub}>Connect PaceAI-FootPod via BLE</Text>
              <Text style={st.podSimSub}>to see impact, GCT and steps</Text>
            </View>
          )}
        </View>

        {/* PAGE 4 — Coach */}
        <View style={st.page}>
          {/* Speaking indicator */}
          {s.isSpeaking && <AudioBars color={zoneColor} />}

          {/* Last message */}
          <View style={st.coachBubble}>
            <Text style={st.coachBubbleTxt}>{lastMsg}</Text>
          </View>

          {/* Predictions */}
          <View style={st.predGrid}>
            <PredCell label="EST. FINISH" value={estFinish} />
            <PredCell label="AVG PACE"    value={avgPace > 0 ? formatPace(avgPace) : '--:--'} />
            <PredCell label="HR %"        value={s.hr ? `${Math.round((s.hr / RUNNER.maxHR) * 100)}%` : '--'} />
            <PredCell label="FATIGUE"     value={`${s.fatigueTotal.toFixed(1)}/10`} />
          </View>
        </View>
      </ScrollView>

      {/* ── Page dots ── */}
      <View style={st.dots}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[st.dot, activePage === i && { backgroundColor: zoneColor, width: 20 }]} />
        ))}
      </View>

      {/* ── Debug overlay (shown when debug mode is on) ── */}
      {s.debugMode && <DebugOverlay />}

      {/* ── Controls ── */}
      <View style={st.ctrl}>
        <TouchableOpacity style={[st.btn, st.btnPause]} onPress={handlePause}>
          <Text style={[st.btnTxt, { color: C.warn }]}>⏸  PAUSE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btn, st.btnEnd]} onPress={endRun}>
          <Text style={[st.btnTxt, { color: C.red }]}>■  END</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LiveDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);
  return <Animated.View style={[ld.dot, { opacity }]} />;
}

function PaceDelta({ current, target }: { current: number; target: number }) {
  const diff = Math.round(current - target);
  if (Math.abs(diff) < 5) return null;
  const fast = diff < 0;
  return (
    <View style={[pd.wrap, { backgroundColor: (fast ? C.green : C.warn) + '22' }]}>
      <Text style={[pd.txt, { color: fast ? C.green : C.warn }]}>
        {fast ? `▲ ${Math.abs(diff)}s faster` : `▼ ${diff}s slower`}
      </Text>
    </View>
  );
}

function FatigueGauge({ value }: { value: number }) {
  const filled = Math.round(Math.min(10, value));
  return (
    <View style={fg.wrap}>
      <Text style={fg.label}>FATIGUE BREAKDOWN</Text>
      <View style={fg.segments}>
        {Array.from({ length: 10 }, (_, i) => {
          const active = i < filled;
          const color  = i < 4 ? C.green : i < 7 ? C.warn : C.red;
          return (
            <View key={i} style={[fg.seg, { backgroundColor: active ? color : C.dim }]} />
          );
        })}
      </View>
    </View>
  );
}

function PodMetric({ label, value, unit, color, size }: {
  label: string; value: string; unit: string; color: string; size: 'large' | 'medium';
}) {
  return (
    <View style={pm.wrap}>
      <Text style={pm.label}>{label}</Text>
      <Text style={[pm.val, { color, fontSize: size === 'large' ? 72 : 44 }]}>{value}</Text>
      <Text style={pm.unit}>{unit}</Text>
    </View>
  );
}

function AudioBars({ color }: { color: string }) {
  const bars = [useRef(new Animated.Value(0.3)).current,
                useRef(new Animated.Value(0.7)).current,
                useRef(new Animated.Value(0.5)).current];
  useEffect(() => {
    bars.forEach((b, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1,   duration: 300 + i * 100, useNativeDriver: true }),
          Animated.timing(b, { toValue: 0.2, duration: 300 + i * 100, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);
  return (
    <View style={ab.wrap}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={[ab.bar, { backgroundColor: color, transform: [{ scaleY: b }] }]} />
      ))}
      <Text style={[ab.txt, { color }]}>COACHING</Text>
    </View>
  );
}

function PredCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={pc.wrap}>
      <Text style={pc.label}>{label}</Text>
      <Text style={pc.val}>{value}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  hdr:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  logo:        { fontFamily: F.header, fontSize: 16, letterSpacing: 3, color: C.green, flex: 1 },
  livePill:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(0,255,163,.1)', borderWidth: 1, borderColor: 'rgba(0,255,163,.3)' },
  liveTxt:     { fontFamily: F.header, fontSize: 9, letterSpacing: 2, color: C.green },
  pageLabel:   { fontFamily: F.header, fontSize: 9, letterSpacing: 2, color: C.muted, flex: 1, textAlign: 'center' },
  iconBtn:     { padding: 4 },
  iconTxt:     { fontSize: 16 },
  zoneStrip:   { height: 3, marginHorizontal: 0 },
  pager:       { flex: 1 },

  // Page container
  page:        { width: W, flex: 1, paddingHorizontal: 24, paddingTop: 20, alignItems: 'center', gap: 16 },

  // Page 1 — Essentials
  essTime:     { alignItems: 'center' },
  essClock:    { fontFamily: F.mono, fontSize: 62, color: C.text, letterSpacing: -2 },
  essClockLabel: { fontFamily: F.header, fontSize: 9, letterSpacing: 3, color: C.muted, marginTop: -4 },
  essPace:     { alignItems: 'center' },
  essPaceVal:  { fontFamily: F.mono, fontSize: 86, lineHeight: 90, letterSpacing: -3 },
  essPaceUnit: { fontFamily: F.header, fontSize: 13, letterSpacing: 3, color: C.muted, marginTop: -8 },
  essDistRow:  { flexDirection: 'row', gap: 12, width: '100%' },
  essDistCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 14, alignItems: 'center' },
  essDistVal:  { fontFamily: F.mono, fontSize: 32, color: C.text },
  essDistLabel:{ fontFamily: F.header, fontSize: 9, letterSpacing: 2, color: C.muted, marginTop: 2 },

  // Page 2 — Body
  hrBlock:     { width: '100%', backgroundColor: C.card, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center', gap: 6 },
  hrVal:       { fontFamily: F.mono, fontSize: 96, lineHeight: 100, letterSpacing: -4 },
  hrUnit:      { fontFamily: F.header, fontSize: 12, letterSpacing: 4, color: C.muted, marginTop: -8 },
  zoneBadge:   { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginTop: 4 },
  zoneBadgeTxt:{ fontFamily: F.header, fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  hrSub:       { fontFamily: F.body, fontSize: 12, color: C.muted },
  bodyRow:     { flexDirection: 'row', gap: 12, width: '100%' },
  bodyCard:    { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 16, alignItems: 'center' },
  bodyCardLabel: { fontFamily: F.header, fontSize: 9, letterSpacing: 3, color: C.muted },
  bodyCardVal:   { fontFamily: F.mono, fontSize: 36, color: C.text },
  bodyCardUnit:  { fontFamily: F.body, fontSize: 11, color: C.muted },

  // Page 3 — Pod
  podRow:      { flexDirection: 'row', gap: 12, width: '100%' },
  podSim:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  podSimIcon:  { fontSize: 48 },
  podSimTitle: { fontFamily: F.header, fontSize: 14, letterSpacing: 2, color: C.muted },
  podSimSub:   { fontFamily: F.body, fontSize: 13, color: C.muted },

  // Page 4 — Coach
  coachBubble: { width: '100%', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 20, minHeight: 100, justifyContent: 'center' },
  coachBubbleTxt: { fontFamily: F.body, fontSize: 15, color: C.text, lineHeight: 24 },
  predGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%' },

  // Dots
  dots:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 8 },
  dot:         { width: 6, height: 6, borderRadius: 3, backgroundColor: C.muted },

  // Controls
  ctrl:        { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4 },
  btn:         { flex: 1, paddingVertical: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  btnPause:    { backgroundColor: 'rgba(255,183,0,.1)', borderColor: 'rgba(255,183,0,.3)' },
  btnEnd:      { backgroundColor: 'rgba(255,69,96,.1)', borderColor: 'rgba(255,69,96,.25)' },
  btnTxt:      { fontFamily: F.header, fontSize: 15, fontWeight: '700', letterSpacing: 2 },
});

const ld = StyleSheet.create({
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
});

const pd = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 4 },
  txt:  { fontFamily: F.header, fontSize: 12, letterSpacing: 1 },
});

const fg = StyleSheet.create({
  wrap:     { width: '100%', gap: 6 },
  label:    { fontFamily: F.header, fontSize: 9, letterSpacing: 3, color: C.muted },
  segments: { flexDirection: 'row', gap: 4 },
  seg:      { flex: 1, height: 8, borderRadius: 4 },
});

const pm = StyleSheet.create({
  wrap:  { alignItems: 'center', width: '100%' },
  label: { fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted },
  val:   { fontFamily: F.mono, lineHeight: 80 },
  unit:  { fontFamily: F.header, fontSize: 12, letterSpacing: 3, color: C.muted, marginTop: -6 },
});

const ab = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  bar:  { width: 4, height: 24, borderRadius: 2 },
  txt:  { fontFamily: F.header, fontSize: 10, letterSpacing: 3, marginLeft: 6 },
});

const pc = StyleSheet.create({
  wrap:  { width: '47%', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center' },
  label: { fontFamily: F.header, fontSize: 9, letterSpacing: 2, color: C.muted },
  val:   { fontFamily: F.mono, fontSize: 22, color: C.text, marginTop: 4 },
});
