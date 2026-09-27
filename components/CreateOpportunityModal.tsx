import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Draft = { title: string; description: string; category: string; location: string; budgetMinNgn: string; budgetMaxNgn: string };
const empty: Draft = { title: '', description: '', category: '', location: '', budgetMinNgn: '', budgetMaxNgn: '' };

export default function CreateOpportunityModal({ visible, onClose, onCreated, getToken, palette }: {
  visible: boolean; onClose: () => void; onCreated: () => void;
  getToken: () => Promise<string | null>; palette: Palette;
}) {
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const field = (key: keyof Draft, label: string, multiline = false, numeric = false) => <TextInput
    value={draft[key]} onChangeText={(value) => setDraft((current) => ({ ...current, [key]: value }))}
    placeholder={label} placeholderTextColor={palette.mutedForeground} multiline={multiline}
    keyboardType={numeric ? 'number-pad' : 'default'}
    style={[styles.input, { color: palette.foreground, backgroundColor: palette.background, borderColor: palette.border }, multiline && styles.multiline]} />;

  const publish = async () => {
    if (busy) return;
    const min = draft.budgetMinNgn.trim() ? Number(draft.budgetMinNgn.replace(/,/g, '')) : null;
    const max = draft.budgetMaxNgn.trim() ? Number(draft.budgetMaxNgn.replace(/,/g, '')) : null;
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0)) || (min !== null && max !== null && min > max)) { setError('Enter valid budgets, with the maximum at least the minimum.'); return; }
    if (!draft.title.trim() || !draft.description.trim() || !draft.category.trim()) { setError('Add a title, description and category.'); return; }
    setBusy(true); setError('');
    try {
      if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL before publishing opportunities.');
      const token = await getToken();
      if (!token) throw new Error('Sign in again to publish an opportunity.');
      const response = await fetch(`${apiBase}/api/jobs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          budgetMinNgn: min,
          budgetMaxNgn: max,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not publish opportunity.');
      setDraft(empty); onClose(); onCreated();
    } catch (publishError) { setError(publishError instanceof Error ? publishError.message : 'Could not publish opportunity.'); }
    finally { setBusy(false); }
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <Text style={[styles.title, { color: palette.foreground }]}>Post a job</Text>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Your job appears in Open jobs and your posted listings. People can enquire through chat.</Text>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
        {field('title', 'What needs to be done?')}
        {field('description', 'Describe the scope and expectations', true)}
        {field('category', 'Category, e.g. Plumbing')}
        {field('location', 'Location or remote', false)}
        <View style={styles.row}>{field('budgetMinNgn', 'Min budget (₦)', false, true)}{field('budgetMaxNgn', 'Max budget (₦)', false, true)}</View>
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
        <View style={styles.row}>
          <Pressable disabled={busy} onPress={onClose} style={[styles.button, { borderWidth: 1, borderColor: palette.border }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>Cancel</Text></Pressable>
          <Pressable onPress={() => void publish()} disabled={busy} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Publishing…' : 'Publish'}</Text></Pressable>
        </View>
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, marginTop: 4, marginBottom: 14, fontFamily: 'Inter_400Regular' },
  fields: { gap: 10, paddingBottom: 10 },
  input: { minWidth: 0, flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 12, fontFamily: 'Inter_400Regular' },
  multiline: { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 },
  row: { flexDirection: 'row', gap: 9 },
  button: { flex: 1, minHeight: 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});
