import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Availability = 'available' | 'busy' | 'unavailable';
const options: { value: Availability; label: string; description: string }[] = [
  { value: 'available', label: 'Available', description: 'Show me in provider searches and allow new requests.' },
  { value: 'busy', label: 'Busy', description: 'Keep my profile visible, but indicate limited capacity.' },
  { value: 'unavailable', label: 'Unavailable', description: 'Hide my profile from new provider searches.' },
];

export default function AvailabilityModal({ visible, onClose, getToken, palette }: {
  visible: boolean; onClose: () => void; getToken: () => Promise<string | null>; palette: Palette;
}) {
  const [value, setValue] = useState<Availability>('available');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';

  useEffect(() => {
    if (!visible) return;
    setBusy(true); setError('');
    (async () => {
      try {
        if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to update availability.');
        const token = await getToken();
        if (!token) throw new Error('Sign in again to manage availability.');
        const response = await fetch(`${apiBase}/api/profile/me`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load profile.');
        const current = payload.profile?.availability;
        if (options.some((option) => option.value === current)) setValue(current);
      } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load availability.'); }
      finally { setBusy(false); }
    })();
  }, [visible]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to update availability.');
      const token = await getToken();
      if (!token) throw new Error('Sign in again to manage availability.');
      const response = await fetch(`${apiBase}/api/profile/me`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ availability: value }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save availability.');
      onClose();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save availability.'); }
    finally { setBusy(false); }
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <Text style={[styles.title, { color: palette.foreground }]}>Availability</Text>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Choose how your profile appears to customers.</Text>
      {busy && !error ? <ActivityIndicator color={palette.tint} /> : null}
      {options.map((option) => <Pressable key={option.value} onPress={() => setValue(option.value)} style={[styles.option, { backgroundColor: palette.background, borderColor: value === option.value ? palette.primary : palette.border }]}>
        <View style={[styles.radio, { borderColor: value === option.value ? palette.tint : palette.mutedForeground }]}>{value === option.value ? <View style={[styles.radioDot, { backgroundColor: palette.primary }]} /> : null}</View>
        <View style={{ flex: 1 }}><Text style={[styles.optionTitle, { color: palette.foreground }]}>{option.label}</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>{option.description}</Text></View>
      </Pressable>)}
      {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
      <View style={styles.actions}><Pressable onPress={onClose} style={[styles.button, { borderColor: palette.border, borderWidth: 1 }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>Cancel</Text></Pressable><Pressable disabled={busy} onPress={() => void save()} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Saving…' : 'Save'}</Text></Pressable></View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28, gap: 10 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 7, opacity: 0.55 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 11, lineHeight: 16, marginTop: 3, fontFamily: 'Inter_400Regular' },
  option: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioDot: { width: 9, height: 9, borderRadius: 5 },
  optionTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: { flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});
