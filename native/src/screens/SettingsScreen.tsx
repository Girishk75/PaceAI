import React, { useEffect, useRef, useState } from 'react';
import { version as APP_VERSION } from '../../package.json';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { State } from 'react-native-ble-plx';
import { useRunStore } from '../store/runStore';
import { bleManager } from '../services/bleManager';
import { loadSettings, saveSettings } from '../services/storage';
import { C, F } from '../theme';

type ScannedDevice = { id: string; name: string; rssi: number };
type ScanTarget    = 'hr' | 'fp' | null;

export function SettingsScreen() {
  const setScreen = useRunStore(s => s.setScreen);

  const [apiKey,  setApiKey]  = useState('');
  const [keySaved, setKeySaved] = useState(false);

  const [hrDevice, setHrDevice] = useState<{ id: string; name: string } | null>(null);
  const [fpDevice, setFpDevice] = useState<{ id: string; name: string } | null>(null);

  const [scanTarget,     setScanTarget]     = useState<ScanTarget>(null);
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([]);

  const foundRef = useRef(new Map<string, ScannedDevice>());
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSettings().then(s => {
      setApiKey(s.apiKey);
      if (s.hrDeviceId) setHrDevice({ id: s.hrDeviceId, name: s.hrDeviceName });
      if (s.fpDeviceId) setFpDevice({ id: s.fpDeviceId, name: s.fpDeviceName });
    });
  }, []);

  useEffect(() => {
    return () => {
      bleManager.stopDeviceScan();
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, []);

  const startScan = async (target: ScanTarget) => {
    const state = await bleManager.state();
    if (state !== State.PoweredOn) {
      Alert.alert('Bluetooth Off', 'Please enable Bluetooth to scan for devices.');
      return;
    }
    foundRef.current.clear();
    setScannedDevices([]);
    setScanTarget(target);

    bleManager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err || !device || !device.name) return;
      foundRef.current.set(device.id, {
        id:   device.id,
        name: device.name,
        rssi: device.rssi ?? -99,
      });
      setScannedDevices([...foundRef.current.values()].sort((a, b) => b.rssi - a.rssi));
    });

    scanTimerRef.current = setTimeout(stopScan, 15000);
  };

  const stopScan = () => {
    bleManager.stopDeviceScan();
    setScanTarget(null);
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
  };

  const selectDevice = async (target: 'hr' | 'fp', device: ScannedDevice) => {
    stopScan();
    const s = await loadSettings();
    if (target === 'hr') {
      await saveSettings({ ...s, hrDeviceId: device.id, hrDeviceName: device.name });
      setHrDevice({ id: device.id, name: device.name });
    } else {
      await saveSettings({ ...s, fpDeviceId: device.id, fpDeviceName: device.name });
      setFpDevice({ id: device.id, name: device.name });
    }
  };

  const forgetDevice = async (target: 'hr' | 'fp') => {
    const s = await loadSettings();
    if (target === 'hr') {
      await saveSettings({ ...s, hrDeviceId: '', hrDeviceName: '' });
      setHrDevice(null);
    } else {
      await saveSettings({ ...s, fpDeviceId: '', fpDeviceName: '' });
      setFpDevice(null);
    }
  };

  const saveKey = async () => {
    const s = await loadSettings();
    await saveSettings({ ...s, apiKey: apiKey.trim() });
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const clearKey = () => {
    Alert.alert('Clear API Key', 'Remove saved Anthropic API key?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        const s = await loadSettings();
        await saveSettings({ ...s, apiKey: '' });
        setApiKey('');
      }},
    ]);
  };

  const renderDeviceSection = (
    label: string,
    target: 'hr' | 'fp',
    paired: { id: string; name: string } | null,
  ) => (
    <View style={st.section}>
      <Text style={st.sectionLabel}>{label}</Text>

      {/* Paired status */}
      <View style={st.pairedRow}>
        <View style={[st.dot, { backgroundColor: paired ? C.green : C.dim }]} />
        <Text style={[st.pairedName, { color: paired ? C.text : C.muted }]}>
          {paired ? paired.name : 'Not configured'}
        </Text>
        {paired && (
          <TouchableOpacity onPress={() => forgetDevice(target)} style={st.forgetBtn}>
            <Text style={st.forgetTxt}>FORGET</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Scan button or stop button */}
      {scanTarget === target ? (
        <TouchableOpacity style={st.stopBtn} onPress={stopScan}>
          <ActivityIndicator size="small" color={C.green} style={{ marginRight: 8 }} />
          <Text style={st.stopTxt}>SCANNING…  TAP TO STOP</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[st.scanBtn, scanTarget !== null && st.scanBtnDisabled]}
          onPress={() => startScan(target)}
          disabled={scanTarget !== null}
        >
          <Text style={st.scanTxt}>SCAN FOR DEVICES</Text>
        </TouchableOpacity>
      )}

      {/* Device list — only shown while scanning for this target */}
      {scanTarget === target && (
        <View style={st.deviceList}>
          {scannedDevices.length === 0 ? (
            <Text style={st.noDevices}>Looking for nearby devices…</Text>
          ) : (
            scannedDevices.map(d => (
              <TouchableOpacity
                key={d.id}
                style={st.deviceRow}
                onPress={() => selectDevice(target, d)}
              >
                <View style={st.deviceLeft}>
                  <Text style={st.deviceName}>{d.name}</Text>
                  <Text style={st.deviceId}>{d.id}</Text>
                </View>
                <Text style={st.deviceRssi}>{d.rssi} dBm</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={st.root}>
      <View style={st.hdr}>
        <TouchableOpacity onPress={() => setScreen('setup')}>
          <Text style={st.back}>← BACK</Text>
        </TouchableOpacity>
        <Text style={st.title}>SETTINGS</Text>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent}>

        {renderDeviceSection('FOOT POD', 'fp', fpDevice)}
        {renderDeviceSection('HEART RATE MONITOR', 'hr', hrDevice)}

        <View style={st.section}>
          <Text style={st.sectionLabel}>AI COACH</Text>
          <Text style={st.hint}>Anthropic API key required for real-time coaching.</Text>
          <TextInput
            style={st.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-ant-..."
            placeholderTextColor={C.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={st.btnRow}>
            <TouchableOpacity style={[st.btn, st.btnSave]} onPress={saveKey}>
              <Text style={[st.btnTxt, { color: C.green }]}>{keySaved ? 'SAVED ✓' : 'SAVE KEY'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.btn, st.btnClear]} onPress={clearKey}>
              <Text style={[st.btnTxt, { color: C.red }]}>CLEAR</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={st.about}>
          <Text style={st.sectionLabel}>ABOUT</Text>
          <Text style={st.aboutTxt}>PaceAI v{APP_VERSION}</Text>
          <Text style={st.aboutTxt}>ESP32 foot pod · Garmin HR · Claude AI</Text>
          <Text style={st.aboutTxt}>Built for Mumbai running by Girish</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  hdr:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  back:          { fontFamily: F.header, fontSize: 12, letterSpacing: 2, color: C.muted, marginRight: 12 },
  title:         { fontFamily: F.header, fontSize: 16, letterSpacing: 3, color: C.text },
  scroll:        { flex: 1 },
  scrollContent: { padding: 18, gap: 4, paddingBottom: 40 },

  section:       { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14, gap: 12 },
  sectionLabel:  { fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted },

  pairedRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:           { width: 8, height: 8, borderRadius: 4 },
  pairedName:    { fontFamily: F.body, fontSize: 14, flex: 1 },
  forgetBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: C.red + '55' },
  forgetTxt:     { fontFamily: F.header, fontSize: 10, letterSpacing: 2, color: C.red },

  scanBtn:       { paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(0,255,163,.1)', borderWidth: 1, borderColor: 'rgba(0,255,163,.3)' },
  scanBtnDisabled: { opacity: 0.4 },
  scanTxt:       { fontFamily: F.header, fontSize: 12, letterSpacing: 2, color: C.green },
  stopBtn:       { flexDirection: 'row', paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,200,255,.08)', borderWidth: 1, borderColor: 'rgba(0,200,255,.3)' },
  stopTxt:       { fontFamily: F.header, fontSize: 11, letterSpacing: 2, color: C.blue },

  deviceList:    { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, gap: 2 },
  noDevices:     { fontFamily: F.body, fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 8 },
  deviceRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 8, borderBottomWidth: 1, borderBottomColor: C.border + '66' },
  deviceLeft:    { flex: 1, gap: 2 },
  deviceName:    { fontFamily: F.body, fontSize: 14, color: C.text },
  deviceId:      { fontFamily: F.mono, fontSize: 10, color: C.muted },
  deviceRssi:    { fontFamily: F.mono, fontSize: 12, color: C.muted },

  hint:          { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  input:         { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontFamily: F.mono, fontSize: 14 },
  btnRow:        { flexDirection: 'row', gap: 10 },
  btn:           { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  btnSave:       { backgroundColor: 'rgba(0,255,163,.12)', borderColor: 'rgba(0,255,163,.3)' },
  btnClear:      { backgroundColor: 'rgba(255,69,96,.12)', borderColor: 'rgba(255,69,96,.25)' },
  btnTxt:        { fontFamily: F.header, fontSize: 13, fontWeight: '700', letterSpacing: 2 },

  about:         { padding: 16, gap: 6 },
  aboutTxt:      { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 20 },
});
