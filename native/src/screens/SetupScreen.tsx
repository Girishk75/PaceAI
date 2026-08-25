import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRunStore, RunConfig } from '../store/runStore';
import { C, F } from '../theme';
import { RUN_TYPES, WEATHER_OPTIONS, RunType, Weather } from '../constants/runner';
import * as Location from 'expo-location';
import { loadSettings } from '../services/storage';
import { bleService } from '../services/bleService';

export function SetupScreen() {
  const startRun     = useRunStore(s => s.startRun);
  const setScreen    = useRunStore(s => s.setScreen);
  const hrConnected  = useRunStore(s => s.hrConnected);
  const fpConnected  = useRunStore(s => s.fpConnected);

  const [runType,     setRunType]     = useState<RunType>('easy');
  const [targetDist,  setTargetDist]  = useState('5');
  const [targetPace,  setTargetPace]  = useState('');  // e.g. "5:30"
  const [weather,     setWeather]     = useState<Weather>('humid');
  const [gpsReady,       setGpsReady]       = useState(false);
  const [savedHrName,    setSavedHrName]    = useState('');
  const [savedFpName,    setSavedFpName]    = useState('');
  const [recalCountdown, setRecalCountdown] = useState<number | null>(null);

  useEffect(() => {
    loadSettings().then(cfg => {
      setSavedHrName(cfg.hrDeviceName);
      setSavedFpName(cfg.fpDeviceName);
    });
  }, []);

  // Warm GPS while the setup screen is open so tracking is live the instant
  // START RUN is tapped — no blocking cold-fix on start (that was the lag).
  // Marks 'ready' only on a genuine lock (accuracy ≤ 50 m); a coarse cell fix
  // doesn't count. The subscription is removed when leaving this screen.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
          loc => { if ((loc.coords.accuracy ?? 999) <= 50) setGpsReady(true); },
        );
        if (cancelled) { sub.remove(); sub = null; }
      } catch { /* permission/location unavailable — indicator stays "acquiring" */ }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, []);

  // Tick the recalibration countdown down to 0 then clear it
  useEffect(() => {
    if (recalCountdown === null) return;
    if (recalCountdown <= 0) { setRecalCountdown(null); return; }
    const t = setTimeout(() => setRecalCountdown(c => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [recalCountdown]);

  const handleRecalibrate = async () => {
    const ok = await bleService.recalibrateFootPod();
    if (ok) setRecalCountdown(12);
  };

  const parsePace = (s: string): number => {
    if (!s) return 0;
    const [m, sec] = s.split(':').map(Number);
    if (isNaN(m)) return 0;
    return m * 60 + (sec || 0);
  };

  const handleStart = () => {
    // Start immediately — GPS has been warming since this screen opened, so
    // there is no blocking cold-fix here (the source of the start lag). The run
    // screen and timer begin instantly; distance/pace still take a few seconds
    // for the first satellite lock (physics), regardless of when we start.
    const config: RunConfig = {
      runType,
      targetDist: parseFloat(targetDist) || 0,
      targetPace: parsePace(targetPace),
      weather,
    };
    startRun(config);
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.hdr}>
        <Text style={s.logo}>PACE<Text style={s.logoAI}>AI</Text></Text>
        <TouchableOpacity onPress={() => setScreen('history')}>
          <Text style={s.histBtn}>HISTORY</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setScreen('settings')}>
          <Text style={s.settBtn}>⚙</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        <Text style={s.sectionLabel}>RUN TYPE</Text>
        <View style={s.row}>
          {RUN_TYPES.map(t => (
            <TouchableOpacity
              key={t}
              style={[s.chip, runType === t && s.chipActive]}
              onPress={() => setRunType(t)}
            >
              <Text style={[s.chipTxt, runType === t && s.chipTxtActive]}>
                {t.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionLabel}>TARGET DISTANCE (KM)</Text>
        <TextInput
          style={s.input}
          value={targetDist}
          onChangeText={setTargetDist}
          keyboardType="decimal-pad"
          placeholder="5"
          placeholderTextColor={C.muted}
        />

        <Text style={s.sectionLabel}>TARGET PACE (min:sec / km, optional)</Text>
        <TextInput
          style={s.input}
          value={targetPace}
          onChangeText={setTargetPace}
          keyboardType="numbers-and-punctuation"
          placeholder="5:30"
          placeholderTextColor={C.muted}
        />

        <Text style={s.sectionLabel}>WEATHER</Text>
        <View style={s.row}>
          {WEATHER_OPTIONS.map(w => (
            <TouchableOpacity
              key={w}
              style={[s.chip, weather === w && s.chipActive]}
              onPress={() => setWeather(w)}
            >
              <Text style={[s.chipTxt, weather === w && s.chipTxtActive]}>
                {w.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionLabel}>DEVICES</Text>
        <View style={s.deviceStatus}>
          <DeviceRow
            label="HEART RATE"
            connected={hrConnected}
            savedName={savedHrName}
            onConfigure={() => setScreen('settings')}
          />
          <DeviceRow
            label="FOOT POD"
            connected={fpConnected}
            savedName={savedFpName}
            onConfigure={() => setScreen('settings')}
          />
          {fpConnected && (
            <TouchableOpacity
              style={[s.recalBtn, recalCountdown !== null && s.recalBtnActive]}
              onPress={recalCountdown === null ? handleRecalibrate : undefined}
              disabled={recalCountdown !== null}
            >
              <Text style={[s.recalTxt, recalCountdown !== null && { color: C.green }]}>
                {recalCountdown !== null ? `CALIBRATING… ${recalCountdown}s` : 'RECALIBRATE POD'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.gpsRow}>
          <View style={[s.gpsDot, { backgroundColor: gpsReady ? C.green : C.warn }]} />
          <Text style={[s.gpsTxt, { color: gpsReady ? C.green : C.muted }]}>
            {gpsReady ? 'GPS READY' : 'ACQUIRING GPS…'}
          </Text>
        </View>

        <TouchableOpacity style={s.startBtn} onPress={handleStart}>
          <Text style={s.startTxt}>START RUN</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function DeviceRow({
  label, connected, savedName, onConfigure,
}: { label: string; connected: boolean; savedName: string; onConfigure: () => void }) {
  const dot   = connected ? C.green : savedName ? C.warn : C.dim;
  const state = connected
    ? (savedName || 'Connected')
    : savedName
      ? `Searching for ${savedName}…`
      : 'Not configured';

  return (
    <View style={dr.row}>
      <View style={[dr.dot, { backgroundColor: dot }]} />
      <View style={{ flex: 1 }}>
        <Text style={dr.label}>{label}</Text>
        <Text style={[dr.state, { color: connected ? C.green : C.muted }]}>{state}</Text>
      </View>
      {!connected && (
        <TouchableOpacity onPress={onConfigure} style={dr.cfgBtn}>
          <Text style={dr.cfgTxt}>CONFIGURE</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const dr = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dot:    { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  label:  { fontFamily: F.header, fontSize: 9, letterSpacing: 2, color: C.muted },
  state:  { fontFamily: F.body, fontSize: 13, marginTop: 2 },
  cfgBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: C.muted + '55' },
  cfgTxt: { fontFamily: F.header, fontSize: 9, letterSpacing: 2, color: C.muted },
});

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  hdr:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  logo:         { fontFamily: F.header, fontSize: 20, letterSpacing: 3, color: C.green, flex: 1 },
  logoAI:       { color: C.text },
  histBtn:      { fontFamily: F.header, fontSize: 11, letterSpacing: 2, color: C.muted, marginRight: 16 },
  settBtn:      { fontFamily: F.header, fontSize: 20, color: C.muted },
  scroll:       { flex: 1 },
  content:      { padding: 18, paddingBottom: 40 },
  sectionLabel: { fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted, marginTop: 20, marginBottom: 8 },
  row:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.muted, backgroundColor: 'transparent' },
  chipActive:   { borderColor: C.green, backgroundColor: 'rgba(0,255,163,0.12)' },
  chipTxt:      { fontFamily: F.header, fontSize: 11, letterSpacing: 2, color: C.muted },
  chipTxtActive:{ color: C.green },
  input:        { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontFamily: F.mono, fontSize: 16, marginBottom: 4 },
  deviceStatus: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 4 },
  gpsRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 },
  gpsDot:       { width: 8, height: 8, borderRadius: 4 },
  gpsTxt:       { fontFamily: F.header, fontSize: 10, letterSpacing: 2 },
  startBtn:     { marginTop: 12, backgroundColor: 'rgba(0,255,163,0.15)', borderWidth: 1, borderColor: 'rgba(0,255,163,0.4)', borderRadius: 12, paddingVertical: 18, alignItems: 'center' },
  startTxt:     { fontFamily: F.header, fontSize: 16, fontWeight: '700', letterSpacing: 3, color: C.green },
  recalBtn:     { marginTop: 4, marginBottom: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.muted + '55', alignItems: 'center' },
  recalBtnActive: { borderColor: C.green + '55', backgroundColor: 'rgba(0,255,163,0.05)' },
  recalTxt:     { fontFamily: F.header, fontSize: 10, letterSpacing: 2, color: C.muted },
});
