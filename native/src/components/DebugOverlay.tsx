import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useRunStore } from '../store/runStore';
import { shareDebugLog } from '../services/debugLogFile';
import { C, F } from '../theme';

export function DebugOverlay() {
  const elapsedSecs    = useRunStore(s => s.elapsedSecs);  // re-renders every tick
  const debugLog       = useRunStore(s => s.debugLog);
  const hrConnected    = useRunStore(s => s.hrConnected);
  const fpConnected    = useRunStore(s => s.fpConnected);
  const lastHrPacketTs = useRunStore(s => s.lastHrPacketTs);
  const lastFpPacketTs = useRunStore(s => s.lastFpPacketTs);
  const hr             = useRunStore(s => s.hr);
  const cadence        = useRunStore(s => s.cadence);
  const impact         = useRunStore(s => s.impact);
  const gct            = useRunStore(s => s.gct);

  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to bottom when new log entries arrive
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [debugLog.length]);

  const now = Date.now();
  const hrAge   = lastHrPacketTs > 0 ? ((now - lastHrPacketTs) / 1000).toFixed(1) : null;
  const fpAge   = lastFpPacketTs > 0 ? ((now - lastFpPacketTs) / 1000).toFixed(1) : null;
  const hrFresh = hrConnected && lastHrPacketTs > 0 && (now - lastHrPacketTs) < 5000;
  const fpFresh = fpConnected && lastFpPacketTs > 0 && (now - lastFpPacketTs) < 5000;

  const hrDot = hrFresh ? C.green : hrConnected ? C.warn : C.dim;
  const fpDot = fpFresh ? C.green : fpConnected ? C.warn : C.dim;

  const handleShare = async () => {
    // Share the full file-backed log (includes all lines, not just the rolling 200)
    await shareDebugLog();
  };

  // elapsedSecs is referenced so the component re-renders every tick, keeping ages live
  void elapsedSecs;

  return (
    <View style={st.panel}>

      {/* Status row */}
      <View style={st.statusRow}>
        <View style={st.statusItem}>
          <View style={[st.dot, { backgroundColor: hrDot }]} />
          <Text style={st.statusTxt}>
            HR {hrFresh ? `${hr} bpm` : hrConnected ? 'no data' : 'off'}
            {hrAge ? `  ${hrAge}s ago` : ''}
          </Text>
        </View>

        <View style={st.statusItem}>
          <View style={[st.dot, { backgroundColor: fpDot }]} />
          <Text style={st.statusTxt}>
            FP {fpFresh ? `${cadence}spm ${impact.toFixed(1)}G ${Math.round(gct)}ms` : fpConnected ? 'no data' : 'off'}
            {fpAge ? `  ${fpAge}s ago` : ''}
          </Text>
        </View>

        <TouchableOpacity onPress={handleShare} style={st.shareBtn}>
          <Text style={st.shareTxt}>SHARE LOG</Text>
        </TouchableOpacity>
      </View>

      {/* Log */}
      <ScrollView ref={scrollRef} style={st.logScroll} nestedScrollEnabled>
        {debugLog.length === 0 ? (
          <Text style={st.emptyTxt}>No events yet — events appear here during a run</Text>
        ) : (
          debugLog.map((line, i) => (
            <Text key={i} style={st.logLine}>{line}</Text>
          ))
        )}
      </ScrollView>

    </View>
  );
}

const st = StyleSheet.create({
  panel:      { backgroundColor: 'rgba(3,7,10,0.95)', borderTopWidth: 1, borderTopColor: '#1a2a1a', paddingTop: 6 },

  statusRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 4, gap: 6 },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  dot:        { width: 6, height: 6, borderRadius: 3 },
  statusTxt:  { fontFamily: F.mono, fontSize: 9, color: C.muted, flexShrink: 1 },

  shareBtn:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(0,255,163,.12)', borderWidth: 1, borderColor: 'rgba(0,255,163,.3)' },
  shareTxt:   { fontFamily: F.header, fontSize: 8, letterSpacing: 1, color: C.green },

  logScroll:  { height: 90, paddingHorizontal: 10 },
  logLine:    { fontFamily: F.mono, fontSize: 9, color: '#4a7a4a', lineHeight: 14 },
  emptyTxt:   { fontFamily: F.mono, fontSize: 9, color: C.dim, paddingVertical: 4 },
});
