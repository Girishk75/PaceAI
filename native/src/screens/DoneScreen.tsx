import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRunStore } from '../store/runStore';
import { C, F } from '../theme';
import { formatTime, formatPace } from '../algorithms/gps';
import { saveRun, loadRuns, loadCoachLog, shareCSV } from '../services/storage';

export function DoneScreen() {
  const s         = useRunStore();
  const setScreen = useRunStore(st => st.setScreen);

  useEffect(() => {
    // Persist run record
    saveRun({
      runId:       s.runId,
      runDate:     s.runDate,
      runTime:     s.runTime,
      runType:     s.runConfig.runType,
      weather:     s.runConfig.weather,
      targetDist:  s.runConfig.targetDist,
      targetPace:  s.runConfig.targetPace,
      elapsedSecs: s.elapsedSecs,
      distKm:      s.dist,
      avgPace:     s.displayPace,
      avgHR:       s.hr,
      maxHR:       s.hr,
      steps:       s.steps,
      avgCadence:  s.cadence,
      avgImpact:   s.impact,
      avgGCT:      s.gct,
      avgFatigue:  s.fatigueTotal,
      peakFatigue: s.fatigueTotal,
    });
  }, []);

  const exportThisRun = async () => {
    const rows = [{
      runId:       s.runId,
      date:        s.runDate,
      time:        s.runTime,
      type:        s.runConfig.runType,
      weather:     s.runConfig.weather,
      distKm:      s.dist.toFixed(3),
      duration:    formatTime(s.elapsedSecs),
      avgPace:     formatPace(s.displayPace),
      avgHR:       s.hr,
      cadence:     s.cadence,
      steps:       s.steps,
      impact:      s.impact.toFixed(2),
      gct:         s.gct,
      fatigue:     s.fatigueTotal.toFixed(2),
    }];
    await shareCSV(`paceai_run_${s.runId}.csv`, rows as any);
  };

  const exportCoachLog = async () => {
    const log = await loadCoachLog();
    await shareCSV('paceai_coach_log.csv', log as any);
  };

  const exportAllRuns = async () => {
    const runs = await loadRuns();
    await shareCSV('paceai_all_runs.csv', runs as any);
  };

  return (
    <SafeAreaView style={st.root}>
      <View style={st.hdr}>
        <Text style={st.logo}>PACE<Text style={st.ai}>AI</Text></Text>
        <Text style={st.doneBadge}>RUN COMPLETE</Text>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.content}>

        <View style={st.summaryRow}>
          <Big label="TIME"  value={formatTime(s.elapsedSecs)} />
          <Big label="DIST"  value={`${s.dist.toFixed(2)} km`} />
        </View>
        <View style={st.summaryRow}>
          <Big label="AVG PACE" value={formatPace(s.displayPace)} unit="/km" />
          <Big label="AVG HR"   value={`${s.hr || '--'} bpm`} />
        </View>
        <View style={st.summaryRow}>
          <Big label="STEPS"    value={`${s.steps}`} />
          <Big label="CADENCE"  value={`${s.cadence || '--'} spm`} />
        </View>
        <View style={st.summaryRow}>
          <Big label="IMPACT"   value={`${s.impact.toFixed(2)} G`} />
          <Big label="GCT"      value={`${s.gct || '--'} ms`} />
        </View>
        <View style={st.summaryRow}>
          <Big label="FATIGUE"  value={`${s.fatigueTotal.toFixed(1)} / 10`} />
        </View>

        <View style={st.exports}>
          <Text style={st.exportLabel}>EXPORT</Text>
          <TouchableOpacity style={st.exportBtn} onPress={exportThisRun}>
            <Text style={st.exportTxt}>⬇ This Run CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.exportBtn} onPress={exportCoachLog}>
            <Text style={st.exportTxt}>⬇ Coach Log CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.exportBtn} onPress={exportAllRuns}>
            <Text style={st.exportTxt}>⬇ All Runs CSV</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      <View style={st.ctrl}>
        <TouchableOpacity style={st.btn} onPress={() => setScreen('setup')}>
          <Text style={st.btnTxt}>NEW RUN</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Big({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={bg.card}>
      <Text style={bg.label}>{label}</Text>
      <Text style={bg.val}>{value}</Text>
      {unit && <Text style={bg.unit}>{unit}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg },
  hdr:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  logo:       { fontFamily: F.header, fontSize: 20, letterSpacing: 3, color: C.green, flex: 1 },
  ai:         { color: C.text },
  doneBadge:  { fontFamily: F.header, fontSize: 11, letterSpacing: 2, color: C.blue },
  scroll:     { flex: 1 },
  content:    { padding: 18, gap: 10, paddingBottom: 30 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  exports:    { marginTop: 16, gap: 8 },
  exportLabel:{ fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted, marginBottom: 4 },
  exportBtn:  { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 18 },
  exportTxt:  { fontFamily: F.body, fontSize: 14, color: C.blue },
  ctrl:       { padding: 18, borderTopWidth: 1, borderTopColor: C.border },
  btn:        { backgroundColor: 'rgba(0,255,163,.12)', borderWidth: 1, borderColor: 'rgba(0,255,163,.3)', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  btnTxt:     { fontFamily: F.header, fontSize: 14, fontWeight: '700', letterSpacing: 2, color: C.green },
});
const bg = StyleSheet.create({
  card:  { flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center' },
  label: { fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted },
  val:   { fontFamily: F.mono, fontSize: 22, color: C.text, marginTop: 4 },
  unit:  { fontFamily: F.body, fontSize: 12, color: C.muted },
});
