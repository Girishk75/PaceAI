import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRunStore } from '../store/runStore';
import { C, F } from '../theme';
import { loadSettings, saveSettings } from '../services/storage';

export function SettingsScreen() {
  const setScreen = useRunStore(s => s.setScreen);
  const [apiKey, setApiKey] = useState('');
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    loadSettings().then(s => setApiKey(s.apiKey));
  }, []);

  const handleSave = async () => {
    await saveSettings({ apiKey: apiKey.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    Alert.alert('Clear API Key', 'Remove saved Anthropic API key?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          setApiKey('');
          await saveSettings({ apiKey: '' });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={st.root}>
      <View style={st.hdr}>
        <TouchableOpacity onPress={() => setScreen('setup')}>
          <Text style={st.back}>← BACK</Text>
        </TouchableOpacity>
        <Text style={st.title}>SETTINGS</Text>
      </View>

      <View style={st.body}>
        <Text style={st.label}>ANTHROPIC API KEY</Text>
        <Text style={st.hint}>Required for AI coaching. Get yours at console.anthropic.com</Text>
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
          <TouchableOpacity style={[st.btn, st.btnSave]} onPress={handleSave}>
            <Text style={[st.btnTxt, { color: C.green }]}>{saved ? 'SAVED ✓' : 'SAVE KEY'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btn, st.btnClear]} onPress={handleClear}>
            <Text style={[st.btnTxt, { color: C.red }]}>CLEAR</Text>
          </TouchableOpacity>
        </View>

        <View style={st.info}>
          <Text style={st.infoLabel}>ABOUT</Text>
          <Text style={st.infoTxt}>PaceAI v2.0 Native</Text>
          <Text style={st.infoTxt}>ESP32 foot pod · Garmin FR245 HR · Claude Sonnet AI</Text>
          <Text style={st.infoTxt}>Built for Mumbai running by Girish</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },
  hdr:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  back:     { fontFamily: F.header, fontSize: 12, letterSpacing: 2, color: C.muted, marginRight: 12 },
  title:    { fontFamily: F.header, fontSize: 16, letterSpacing: 3, color: C.text },
  body:     { padding: 18, gap: 12 },
  label:    { fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted, marginTop: 8 },
  hint:     { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  input:    { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontFamily: F.mono, fontSize: 14 },
  btnRow:   { flexDirection: 'row', gap: 10 },
  btn:      { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  btnSave:  { backgroundColor: 'rgba(0,255,163,.12)', borderColor: 'rgba(0,255,163,.3)' },
  btnClear: { backgroundColor: 'rgba(255,69,96,.12)', borderColor: 'rgba(255,69,96,.25)' },
  btnTxt:   { fontFamily: F.header, fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  info:     { marginTop: 24, padding: 18, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, gap: 6 },
  infoLabel:{ fontFamily: F.header, fontSize: 10, letterSpacing: 3, color: C.muted, marginBottom: 4 },
  infoTxt:  { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 20 },
});
