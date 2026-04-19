import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, PanResponder, BackHandler,
  Animated, StatusBar,
} from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useRunStore } from '../store/runStore';
import { C, F } from '../theme';
import { formatTime, formatPace } from '../algorithms/gps';

const HOLD_MS = 2000;

export function RunShieldScreen() {
  const s          = useRunStore();
  const setScreen  = useRunStore(st => st.setScreen);
  const pauseRun   = useRunStore(st => st.pauseRun);

  const [holding, setHolding] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const anim     = useRef<Animated.CompositeAnimation | null>(null);
  const holdTimer= useRef<ReturnType<typeof setTimeout> | null>(null);

  // Full immersive mode — hides status bar and nav bar
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
      if (finished) {
        setScreen('live'); // unlock
      }
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

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const zoneColor = ['', C.blue, C.green, C.warn, 'orange', C.red][s.hrZone] || C.blue;

  return (
    <View style={st.root} {...panResponder.panHandlers}>
      {/* Main info */}
      <View style={st.center}>
        <Text style={st.time}>{formatTime(s.elapsedSecs)}</Text>
        <Text style={st.dist}>{s.dist.toFixed(2)} km</Text>
        <Text style={st.pace}>{formatPace(s.displayPace)}<Text style={st.paceUnit}> /km</Text></Text>
        <Text style={[st.hr, { color: zoneColor }]}>{s.hr || '--'} <Text style={st.hrSub}>bpm · Z{s.hrZone}</Text></Text>
      </View>

      {/* Lock hint */}
      <View style={st.bottom}>
        {holding ? (
          <View style={st.progressTrack}>
            <Animated.View style={[st.progressFill, { width: barWidth }]} />
          </View>
        ) : (
          <Text style={st.hint}>HOLD TO UNLOCK</Text>
        )}
        <Text style={st.lockIcon}>🔒</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  center:        { alignItems: 'center', gap: 12 },
  time:          { fontFamily: F.mono, fontSize: 64, color: C.text },
  dist:          { fontFamily: F.mono, fontSize: 36, color: C.green },
  pace:          { fontFamily: F.mono, fontSize: 28, color: C.text },
  paceUnit:      { fontSize: 16, color: C.muted },
  hr:            { fontFamily: F.mono, fontSize: 28 },
  hrSub:         { fontSize: 16, color: C.muted },
  bottom:        { position: 'absolute', bottom: 60, alignItems: 'center', width: '80%', gap: 12 },
  hint:          { fontFamily: F.header, fontSize: 12, letterSpacing: 3, color: C.muted },
  progressTrack: { width: '100%', height: 4, backgroundColor: C.dim, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: 4, backgroundColor: C.green, borderRadius: 2 },
  lockIcon:      { fontSize: 24 },
});
