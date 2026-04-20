import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRunStore, RunConfig } from '../store/runStore';
import { useRunStore as useStore } from '../store/runStore';
import { C, F } from '../theme';
import { RUN_TYPES, WEATHER_OPTIONS, RunType, Weather } from '../constants/runner';
import { formatPace } from '../algorithms/gps';
import { prewarmGPS } from '../hooks/useGPS';

export function SetupScreen() {
  const startRun  = useRunStore(s => s.startRun);
  const setScreen = useRunStore(s => s.setScreen);

  const [runType,    setRunType]    = useState<RunType>('easy');
  const [targetDist, setTargetDist] = useState('5');
  const [targetPace, setTargetPace] = useState('');  // e.g. "5:30"
  const [weather,    setWeather]    = useState<Weather>('humid');
  const [prewarmed,  setPrewarmed]  = useState(false);

  const parsePace = (s: string): number => {
    if (!s) return 0;
    const [m, sec] = s.split(':').map(Number);
    if (isNaN(m)) return 0;
    return m * 60 + (sec || 0);
  };

  const handleStart = async () => {
    if (!prewarmed) {
      await prewarmGPS();
      setPrewarmed(true);
    }
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

        <TouchableOpacity style={s.startBtn} onPress={handleStart}>
          <Text style={s.startTxt}>START RUN</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

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
  startBtn:     { marginTop: 32, backgroundColor: 'rgba(0,255,163,0.15)', borderWidth: 1, borderColor: 'rgba(0,255,163,0.4)', borderRadius: 12, paddingVertical: 18, alignItems: 'center' },
  startTxt:     { fontFamily: F.header, fontSize: 16, fontWeight: '700', letterSpacing: 3, color: C.green },
});
