import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, PanResponder, BackHandler, Animated, StatusBar, Dimensions,
} from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useRunStore } from '../store/runStore';
import { C, F } from '../theme';
import { formatTime, formatPace } from '../algorithms/gps';

const { width: W } = Dimensions.get('window');
const HOLD_MS = 2000;
const ZONE_COLOR = ['', '#00c8ff', '#00ffa3', '#ffb700', '#ff8c00', '#ff4560'];

export function RunShieldScreen() {
  const s         = useRunStore();
  const setScreen = useRunStore(st => st.setScreen);

  const [holding, setHolding]   = useState(false);
  const progress  = useRef(new Animated.Value(0)).current;
  const anim      = useRef<Animated.CompositeAnimation | null>(null);

  const zoneColor = ZONE_COLOR[s.hrZone] || C.blue;

  // Full immersive — hides both bars so nothing can be tapped accidentally
  useEffect(() => {
    StatusBar.setHidden(true, 'none');
    NavigationBar.setVisibilityAsync('hidden');
    NavigationBar.setBehaviorAsync('overlay-swipe');
    return () => {
      StatusBar.setHidden(false, 'fade');
      NavigationBar.setVisibilityAsync('visible');
    };
  }, []);

  // Block hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const startHold = () => {
    setHolding(true);
    progress.setValue(0);
    anim.current = Animated.timing(progress, {
      toValue:         1,
      duration:        HOLD_MS,
      useNativeDriver: false,
    });
    anim.current.start(({ finished }) => {
      if (finished) setScreen('live');
    });
  };

  const cancelHold = () => {
    anim.current?.stop();
    progress.setValue(0);
    setHolding(false);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant:          startHold,
    onPanResponderRelease:        cancelHold,
    onPanResponderTerminate:      cancelHold,
  });

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: [0, W] });

  return (
    <View style={st.root} {...panResponder.panHandlers}>

      {/* Zone color accent — thin bar at very top */}
      <View style={[st.topBar, { backgroundColor: zoneColor }]} />

      {/* Main metrics — large, readable at a glance */}
      <View style={st.center}>

        <Text style={st.time}>{formatTime(s.elapsedSecs)}</Text>

        <Text style={[st.pace, { color: zoneColor }]}>
          {formatPace(s.displayPace)}
          <Text style={st.paceUnit}> /km</Text>
        </Text>

        <Text style={st.dist}>{s.dist.toFixed(2)} km</Text>

        <View style={[st.hrRow, { borderColor: zoneColor + '44' }]}>
          <Text style={[st.hr, { color: zoneColor }]}>{s.hr || '--'}</Text>
          <View style={st.hrRight}>
            <Text style={[st.zone, { color: zoneColor }]}>Z{s.hrZone}</Text>
            <Text style={st.bpm}>bpm</Text>
          </View>
        </View>

      </View>

      {/* Hold-to-unlock bar — fills from left edge */}
      <View style={st.bottom}>
        {holding ? (
          <View style={st.progressTrack}>
            <Animated.View style={[st.progressFill, { width: barWidth, backgroundColor: zoneColor }]} />
          </View>
        ) : (
          <Text style={st.hint}>HOLD ANYWHERE TO UNLOCK</Text>
        )}
        <Text style={st.lockIcon}>🔒</Text>
      </View>

    </View>
  );
}

const st = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  topBar:        { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  center:        { alignItems: 'center', gap: 18 },
  time:          { fontFamily: F.mono, fontSize: 72, color: C.text, letterSpacing: -3 },
  pace:          { fontFamily: F.mono, fontSize: 64, letterSpacing: -2 },
  paceUnit:      { fontSize: 20, color: C.muted },
  dist:          { fontFamily: F.mono, fontSize: 40, color: C.muted },
  hrRow:         { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 20, borderWidth: 1, marginTop: 8 },
  hr:            { fontFamily: F.mono, fontSize: 52 },
  hrRight:       { gap: 2 },
  zone:          { fontFamily: F.header, fontSize: 22, fontWeight: '700', letterSpacing: 2 },
  bpm:           { fontFamily: F.header, fontSize: 11, letterSpacing: 2, color: C.muted },
  bottom:        { position: 'absolute', bottom: 48, alignItems: 'center', width: '100%', gap: 12 },
  hint:          { fontFamily: F.header, fontSize: 11, letterSpacing: 3, color: C.muted },
  progressTrack: { width: W, height: 4, backgroundColor: C.dim, overflow: 'hidden' },
  progressFill:  { height: 4 },
  lockIcon:      { fontSize: 22 },
});
