import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRunStore } from '../store/runStore';
import { C, F } from '../theme';
import { formatTime, formatPace } from '../algorithms/gps';
import * as KeepAwake from 'expo-keep-awake';

export function PausedScreen() {
  const s         = useRunStore();
  const resumeRun = useRunStore(st => st.resumeRun);
  const endRun    = useRunStore(st => st.endRun);

  const handleResume = () => {
    KeepAwake.activateKeepAwakeAsync();
    resumeRun();
  };

  return (
    <SafeAreaView style={st.root}>
      <View style={st.hdr}>
        <Text style={st.logo}>PACE<Text style={st.ai}>AI</Text></Text>
        <View style={st.pausePill}>
          <Text style={st.pauseTxt}>PAUSED</Text>
        </View>
      </View>

      <View style={st.body}>
        <View style={st.row}>
          <Stat label="TIME"   value={formatTime(s.elapsedSecs)} />
          <Stat label="DIST"   value={`${s.dist.toFixed(2)} km`} />
        </View>
        <View style={st.row}>
          <Stat label="PACE"   value={formatPace(s.displayPace)} unit="/km" />
          <Stat label="HR"     value={`${s.hr || '--'} bpm`} />
        </View>
        <View style={st.row}>
          <Stat label="CADENCE" value={`${s.cadence || '--'} spm`} />
          <Stat label="FATIGUE" value={`${s.fatigueTotal.toFixed(1)} / 10`} />
        </View>
      </View>

      <View style={st.ctrl}>
        <TouchableOpacity style={[st.btn, st.btnResume]} onPress={handleResume}>
          <Text style={[st.btnTxt, { color: C.green }]}>RESUME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btn, st.btnEnd]} onPress={endRun}>
          <Text style={[st.btnTxt, { color: C.red }]}>END RUN</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={sc.wrap}>
      <Text style={sc.label}>{label}</Text>
      <Text style={sc.val}>{value}</Text>
      {unit && <Text style={sc.unit}>{unit}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },
  hdr:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  logo:      { fontFamily: F.header, fontSize: 20, letterSpacing: 3, color: C.green, flex: 1 },
  ai:        { color: C.text },
  pausePill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,183,0,.1)', borderWidth: 1, borderColor: 'rgba(255,183,0,.4)' },
  pauseTxt:  { fontFamily: F.header, fontSize: 11, letterSpacing: 2, color: C.warn },
  body:      { flex: 1, padding: 18, gap: 16, justifyContent: 'center' },
  row:       { flexDirection: 'row', gap: 12 },
  ctrl:      { padding: 18, gap: 12, borderTopWidth: 1, borderTopColor: C.border },
  btn:       { paddingVertical: 16, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  btnResume: { backgroundColor: 'rgba(0,255,163,.12)', borderColor: 'rgba(0,255,163,.3)' },
  btnEnd:    { backgroundColor: 'rgba(255,69,96,.12)', borderColor: 'rgba(255,69,96,.25)' },
  btnTxt:    { fontFamily: F.header, fontSize: 14, fontWeight: '700', letterSpacing: 2 },
});
const sc = StyleSheet.create({
  wrap:  { flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center' },
  label: { fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted },
  val:   { fontFamily: F.mono, fontSize: 22, color: C.text, marginTop: 4 },
  unit:  { fontFamily: F.body, fontSize: 12, color: C.muted },
});
