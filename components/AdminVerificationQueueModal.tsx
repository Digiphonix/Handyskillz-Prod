import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Submission = { id: string; profile_id: string; document_type: string; document_url: string | null; submitted_at: string; profiles?: { display_name?: string; role?: string; city?: string } | null };

export default function AdminVerificationQueueModal({ visible, onClose, getToken, palette }: {
  visible: boolean; onClose: () => void; getToken: () => Promise<string | null>; palette: Palette;
}) {
  const [items, setItems] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const request = async (path: string, init?: RequestInit) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to review submissions.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to review submissions.');
    const response = await fetch(`${apiBase}/api${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Admin request failed.');
    return payload;
  };
  const load = async () => {
    setBusy(true); setError('');
    try { const payload = await request('/admin/verifications'); setItems(Array.isArray(payload.submissions) ? payload.submissions : []); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load the verification queue.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (visible) void load(); }, [visible]);
  const review = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(true); setError('');
    try { await request(`/admin/verifications/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); }
    catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : 'Could not save review.'); setBusy(false); }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <View style={styles.header}><View><Text style={[styles.title, { color: palette.foreground }]}>Verification queue</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Review submitted provider documents.</Text></View><Pressable onPress={onClose}><Text style={[styles.close, { color: palette.tint }]}>Done</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.content}>
        {busy && items.length === 0 ? <ActivityIndicator color={palette.tint} /> : null}
        {items.map((item) => <View key={item.id} style={[styles.card, { backgroundColor: palette.background, borderColor: palette.border }]}>
          <Text style={[styles.name, { color: palette.foreground }]}>{item.profiles?.display_name || 'Provider'}</Text>
          <Text style={[styles.detail, { color: palette.mutedForeground }]}>{item.document_type} · {item.profiles?.role || 'Provider'} · {item.profiles?.city || 'Location not set'}</Text>
          <Text style={[styles.detail, { color: palette.mutedForeground }]}>Submitted {new Date(item.submitted_at).toLocaleDateString()}</Text>
          <View style={styles.actions}>
            <Pressable disabled={busy} onPress={() => void review(item.id, 'rejected')} style={[styles.action, { borderColor: palette.destructive, borderWidth: 1 }]}><Text style={[styles.actionText, { color: palette.destructive }]}>Reject</Text></Pressable>
            <Pressable disabled={busy} onPress={() => void review(item.id, 'approved')} style={[styles.action, { backgroundColor: palette.primary }]}><Text style={[styles.actionText, { color: palette.primaryForeground }]}>Approve</Text></Pressable>
          </View>
        </View>)}
        {!busy && items.length === 0 && !error ? <Text style={[styles.empty, { color: palette.mutedForeground }]}>No pending submissions.</Text> : null}
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '88%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 15 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, marginTop: 4, fontFamily: 'Inter_400Regular' },
  close: { fontSize: 12, fontFamily: 'Inter_700Bold', paddingVertical: 5 },
  content: { gap: 10 },
  card: { borderWidth: 1, borderRadius: 15, padding: 13, gap: 5 },
  name: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  detail: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { flex: 1, minHeight: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  empty: { fontSize: 12, paddingVertical: 15, fontFamily: 'Inter_400Regular' },
  error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});
