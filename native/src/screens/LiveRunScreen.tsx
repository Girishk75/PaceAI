import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackgroundTimer from 'react-native-background-timer';
import * as KeepAwake from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { useRunStore } from '../store/runStore';
import { C, F } from '../theme';
import { formatTime, formatPace } from '../algorithms/gps';
import { useGPS } from '../hooks/useGPS';
import { checkTrigger, fireCoach, speak, stopSpeech } from '../services/aiCoach';

const ZONE_COLORS = ['', C.blue, C.green, C.warn, 'orange', C.red];

export function LiveRunScreen() {
  const s            = useRunStore();
  const pauseRun     = useRunStore(st => st.pauseRun);
  const endRun       = useRunStore(st => st.endRun);
  const setScreen    = useRunStore(st => st.setScreen);
  const tick         = useRunStore(st => st.tick);
  const markCoach    = useRunStore(st => st.markCoach);
  const setMuted     = useRunStore(st => st.setMuted);
  const setSpeaking  = useRunStore(st => st.setSpeaking);

  const timerRef     = useRef<number | null>(null);
  const stateRef     = useRef(useRunStore.getState());

  useGPS();

  // Keep store ref current for timer callback (avoids stale closure)
  useEffect(() => {
    const unsub = useRunStore.subscribe(state => { stateRef.current = state; });
    return unsub;
  }, []);

  // Auto-shield after 3s
  useEffect(() => {
    const t = setTimeout(() => setScreen('shield'), 3000);
    return () => clearTimeout(t);
  }, [setScreen]);

  // Wake lock
  useEffect(() => {
    KeepAwake.activateKeepAwakeAsync();
    NavigationBar.setVisibilityAsync('hidden');
    return () => {
      KeepAwake.deactivateKeepAwake();
      NavigationBar.setVisibilityAsync('visible');
    };
  }, []);

  // BackgroundTimer — survives screen lock (unlike setInterval)
  useEffect(() => {
    timerRef.current = BackgroundTimer.setInterval(async () => {
      const st = stateRef.current;
      if (!st.running) return;
      st.tick();

      // Coach trigger check (after tick, so elapsedSecs is updated)
      if (st.coachMuted || st.isSpeaking) return;
      const trigger = checkTrigger(stateRef.current);
      if (!trigger) return;

      st.markCoach(trigger);
      const text = await fireCoach(trigger, stateRef.current);
      if (text) {
        st.setSpeaking(true);
        speak(text, () => st.setSpeaking(false));
      }
    }, 1000);

    return () => {
      if (timerRef.current) BackgroundTimer.clearInterval(timerRef.current);
    };
  }, []);

  const handlePause = () => {
    pauseRun();
    stopSpeech();
    KeepAwake.deactivateKeepAwake();
  };

  const handleMute = () => {
    if (!s.coachMuted) stopSpeech();
    setMuted(!s.coachMuted);
  };

  const zoneColor = ZONE_COLORS[s.hrZone] || C.blue;

  return (
    <SafeAreaView style={st.root}>
      {/* Header */}
      <View style={st.hdr}>
        <Text style={st.logo}>PACE<Text style={st.logoAI}>AI</Text></Text>
        <View style={st.pill}>
          <View style={st.ldot} />
          <Text style={st.pillTxt}>LIVE</Text>
        </View>
        <TouchableOpacity onPress={() => setScreen('shield')} style={st.iconBtn}>
          <Text style={st.iconTxt}>🔒</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleMute} style={st.iconBtn}>
          <Text style={st.iconTxt}>{s.coachMuted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.content}>

        {/* Clock + Distance */}
        <View style={st.bigRow}>
          <View style={st.bigCard}>
            <Text style={st.bigLabel}>TIME</Text>
            <Text style={st.bigVal}>{formatTime(s.elapsedSecs)}</Text>
          </View>
          <View style={st.bigCard}>
            <Text style={st.bigLabel}>DIST</Text>
            <Text style={st.bigVal}>{s.dist.toFixed(2)}</Text>
            <Text style={st.bigUnit}>{s.gpsPace > 0 && !s.gpsPaceStale ? 'km' : '⚡ sim km'}</Text>
          </View>
        </View>

        {/* Pace */}
        <View style={st.paceCard}>
          <Text style={st.paceLabel}>PACE</Text>
          <Text style={st.paceVal}>{formatPace(s.displayPace)}</Text>
          <Text style={st.paceUnit}>
            {s.gpsPace > 0 && !s.gpsPaceStale ? `GPS ±${Math.round(s.gpsAccuracy)}m` : '⚡ SIM PACE'}
          </Text>
        </View>

        {/* HR */}
        <View style={[st.card, { borderColor: zoneColor + '66' }]}>
          <View style={st.cardRow}>
            <View>
              <Text style={st.cardLabel}>HEART RATE</Text>
              <Text style={[st.cardBig, { color: zoneColor }]}>{s.hr || '--'}</Text>
              <Text style={st.cardSub}>{s.hrConnected ? 'bpm · BLE' : '⚡ Sim HR'}</Text>
            </View>
            <View style={st.zoneBox}>
              <Text style={[st.zoneTxt, { color: zoneColor }]}>Z{s.hrZone}</Text>
            </View>
          </View>
        </View>

        {/* Metrics grid */}
        <View style={st.grid}>
          <MetricCard label="CADENCE" value={s.cadence ? `${s.cadence}` : '--'} unit="spm" sim={!s.fpConnected} />
          <MetricCard label="STEPS"   value={`${s.steps}`} unit="steps" sim={!s.fpConnected} />
          <MetricCard label="IMPACT"  value={s.impact ? s.impact.toFixed(2) : '--'} unit="G" sim={!s.fpConnected} />
          <MetricCard label="GCT"     value={s.gct ? `${Math.round(s.gct)}` : '--'} unit="ms" sim={!s.fpConnected} />
        </View>

        {/* Fatigue */}
        <View style={st.card}>
          <Text style={st.cardLabel}>FATIGUE INDEX</Text>
          <Text style={[st.cardBig, { color: s.fatigueTotal > 7 ? C.red : s.fatigueTotal > 4 ? C.warn : C.green }]}>
            {s.fatigueTotal.toFixed(1)}<Text style={st.cardSub}> / 10</Text>
          </Text>
          <View style={st.fatRow}>
            <FatBar label="HR"  val={s.fatigueHR} />
            <FatBar label="CAD" val={s.fatigueCad} />
            <FatBar label="GCT" val={s.fatigueGCT} />
            <FatBar label="IMP" val={s.fatigueImp} />
          </View>
        </View>

      </ScrollView>

      {/* Controls */}
      <View style={st.ctrl}>
        <TouchableOpacity style={[st.btn, st.btnPause]} onPress={handlePause}>
          <Text style={st.btnTxt}>PAUSE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btn, st.btnStop]} onPress={endRun}>
          <Text style={st.btnTxt}>END</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function MetricCard({ label, value, unit, sim }: { label: string; value: string; unit: string; sim: boolean }) {
  return (
    <View style={mc.card}>
      <Text style={mc.label}>{label}</Text>
      <Text style={mc.val}>{value}</Text>
      <Text style={mc.unit}>{sim ? '⚡ Simulated' : unit}</Text>
    </View>
  );
}

function FatBar({ label, val }: { label: string; val: number }) {
  const pct = Math.min(1, val / 10);
  return (
    <View style={fb.wrap}>
      <Text style={fb.label}>{label}</Text>
      <View style={fb.track}>
        <View style={[fb.fill, { width: `${pct * 100}%` as any }]} />
      </View>
      <Text style={fb.val}>{val.toFixed(1)}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  hdr:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  logo:    { fontFamily: F.header, fontSize: 18, letterSpacing: 3, color: C.green, flex: 1 },
  logoAI:  { color: C.text },
  pill:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(0,255,163,.1)', borderWidth: 1, borderColor: 'rgba(0,255,163,.4)', marginRight: 8 },
  ldot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  pillTxt: { fontFamily: F.header, fontSize: 10, letterSpacing: 2, color: C.green },
  iconBtn: { paddingHorizontal: 6 },
  iconTxt: { fontSize: 18 },
  scroll:  { flex: 1 },
  content: { padding: 14, paddingBottom: 20, gap: 10 },
  bigRow:  { flexDirection: 'row', gap: 10 },
  bigCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center' },
  bigLabel:{ fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted },
  bigVal:  { fontFamily: F.mono, fontSize: 36, color: C.text, marginTop: 4 },
  bigUnit: { fontFamily: F.body, fontSize: 11, color: C.muted },
  paceCard:{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center' },
  paceLabel:{ fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted },
  paceVal: { fontFamily: F.mono, fontSize: 48, color: C.green },
  paceUnit:{ fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 2 },
  card:    { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel:{ fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted, marginBottom: 4 },
  cardBig: { fontFamily: F.mono, fontSize: 36, color: C.text },
  cardSub: { fontFamily: F.body, fontSize: 12, color: C.muted },
  zoneBox: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  zoneTxt: { fontFamily: F.header, fontSize: 22, fontWeight: '700' },
  grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fatRow:  { marginTop: 10, gap: 6 },
  ctrl:    { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: C.border },
  btn:     { flex: 1, paddingVertical: 16, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  btnPause:{ backgroundColor: 'rgba(255,183,0,.12)', borderColor: 'rgba(255,183,0,.3)' },
  btnStop: { backgroundColor: 'rgba(255,69,96,.12)', borderColor: 'rgba(255,69,96,.25)' },
  btnTxt:  { fontFamily: F.header, fontSize: 14, fontWeight: '700', letterSpacing: 2, color: C.warn },
});

const mc = StyleSheet.create({
  card:  { width: '47%', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, alignItems: 'center' },
  label: { fontFamily: F.header, fontSize: 9, letterSpacing: 3, color: C.muted },
  val:   { fontFamily: F.mono, fontSize: 28, color: C.text, marginTop: 2 },
  unit:  { fontFamily: F.body, fontSize: 11, color: C.muted },
});

const fb = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: F.header, fontSize: 10, letterSpacing: 1, color: C.muted, width: 30 },
  track: { flex: 1, height: 4, backgroundColor: C.dim, borderRadius: 2, overflow: 'hidden' },
  fill:  { height: 4, backgroundColor: C.warn, borderRadius: 2 },
  val:   { fontFamily: F.mono, fontSize: 11, color: C.muted, width: 28, textAlign: 'right' },
});
