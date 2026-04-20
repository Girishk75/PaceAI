import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRunStore } from '../store/runStore';
import { C, F } from '../theme';
import { formatTime, formatPace } from '../algorithms/gps';
import { loadRuns, loadCoachLog, shareCSV, RunRecord } from '../services/storage';

export function HistoryScreen() {
  const setScreen = useRunStore(s => s.setScreen);
  const [runs, setRuns] = useState<RunRecord[]>([]);

  useEffect(() => {
    loadRuns().then(setRuns);
  }, []);

  const exportAll = async () => {
    await shareCSV('paceai_all_runs.csv', runs as any);
  };

  const exportCoachLog = async () => {
    const log = await loadCoachLog();
    await shareCSV('paceai_coach_log.csv', log as any);
  };

  return (
    <SafeAreaView style={st.root}>
      <View style={st.hdr}>
        <TouchableOpacity onPress={() => setScreen('setup')}>
          <Text style={st.back}>← BACK</Text>
        </TouchableOpacity>
        <Text style={st.title}>HISTORY</Text>
        <TouchableOpacity onPress={exportAll}>
          <Text style={st.export}>⬇ ALL</Text>
        </TouchableOpacity>
      </View>

      <View style={st.exportRow}>
        <TouchableOpacity style={st.exportBtn} onPress={exportCoachLog}>
          <Text style={st.exportTxt}>⬇ Coach Log CSV</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={runs}
        keyExtractor={r => r.runId}
        contentContainerStyle={st.list}
        renderItem={({ item: r }) => (
          <View style={st.card}>
            <View style={st.cardTop}>
              <Text style={st.cardDate}>{r.runDate} {r.runTime}</Text>
              <Text style={st.cardType}>{r.runType.toUpperCase()}</Text>
            </View>
            <View style={st.cardRow}>
              <Stat label="DIST"   value={`${r.distKm.toFixed(2)} km`} />
              <Stat label="TIME"   value={formatTime(r.elapsedSecs)} />
              <Stat label="PACE"   value={formatPace(r.avgPace)} />
              <Stat label="HR"     value={`${r.avgHR}`} />
            </View>
            <View style={st.cardRow}>
              <Stat label="CAD"    value={`${r.avgCadence}`} />
              <Stat label="STEPS"  value={`${r.steps}`} />
              <Stat label="FAT"    value={r.avgFatigue.toFixed(1)} />
              <Stat label="WEATHER" value={r.weather} />
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={st.empty}>No runs yet</Text>}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={sc.wrap}>
      <Text style={sc.label}>{label}</Text>
      <Text style={sc.val}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },
  hdr:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  back:      { fontFamily: F.header, fontSize: 12, letterSpacing: 2, color: C.muted, marginRight: 12 },
  title:     { fontFamily: F.header, fontSize: 16, letterSpacing: 3, color: C.text, flex: 1 },
  export:    { fontFamily: F.header, fontSize: 12, letterSpacing: 2, color: C.blue },
  exportRow: { paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  exportBtn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'flex-start' },
  exportTxt: { fontFamily: F.body, fontSize: 13, color: C.blue },
  list:      { padding: 18, gap: 10 },
  card:      { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, gap: 10 },
  cardTop:   { flexDirection: 'row', justifyContent: 'space-between' },
  cardDate:  { fontFamily: F.body, fontSize: 13, color: C.muted },
  cardType:  { fontFamily: F.header, fontSize: 11, letterSpacing: 2, color: C.green },
  cardRow:   { flexDirection: 'row' },
  empty:     { fontFamily: F.body, fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 60 },
});
const sc = StyleSheet.create({
  wrap:  { flex: 1, alignItems: 'center' },
  label: { fontFamily: F.header, fontSize: 9, letterSpacing: 2, color: C.muted },
  val:   { fontFamily: F.mono, fontSize: 14, color: C.text, marginTop: 2 },
});
