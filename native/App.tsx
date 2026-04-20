import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Rajdhani_700Bold,
} from '@expo-google-fonts/rajdhani';
import {
  ShareTechMono_400Regular,
} from '@expo-google-fonts/share-tech-mono';
import {
  Barlow_400Regular,
  Barlow_500Medium,
} from '@expo-google-fonts/barlow';

import { useRunStore } from './src/store/runStore';
import { useBLE } from './src/hooks/useBLE';
import { initBackgroundGPS } from './src/hooks/useGPS';
import { initTTS } from './src/services/aiCoach';

import { SetupScreen }   from './src/screens/SetupScreen';
import { LiveRunScreen } from './src/screens/LiveRunScreen';
import { RunShieldScreen}from './src/screens/RunShieldScreen';
import { PausedScreen }  from './src/screens/PausedScreen';
import { DoneScreen }    from './src/screens/DoneScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen} from './src/screens/SettingsScreen';

function Navigator() {
  const screen = useRunStore(s => s.screen);
  useBLE(); // BLE scanning active throughout app lifetime

  switch (screen) {
    case 'live':     return <LiveRunScreen />;
    case 'shield':   return <RunShieldScreen />;
    case 'paused':   return <PausedScreen />;
    case 'done':     return <DoneScreen />;
    case 'history':  return <HistoryScreen />;
    case 'settings': return <SettingsScreen />;
    default:         return <SetupScreen />;
  }
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Rajdhani_700Bold,
    ShareTechMono_400Regular,
    Barlow_400Regular,
    Barlow_500Medium,
  });

  useEffect(() => {
    initBackgroundGPS();  // configure ForegroundService GPS — must run once at startup
    initTTS();            // warm up TTS engine + enable audio ducking
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#03070a" />
        <Navigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
