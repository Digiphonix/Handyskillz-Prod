import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Transfer = { id: string; job_id: string; amount_ngn: number; created_at: string; jobs?: { title?: string } | null };

export default function AdminPaymentTransfersModal({ visible, onClose, getToken, palette }: {
  visible: boolean; onClose: () => void; getToken: () => Promise<string | null>; palette: Palette;
}) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';

  const request = async (path: string, init?: RequestInit) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to manage payment transfers.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to manage payment transfers.');
    const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${token}`);
    if (init?.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}/api${path}`, { ...init, headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Payment transfer request failed.');
    return payload;
  };

  const load = async () => {
    setLoading(true); setError('');
    try { const payload = await request('/admin/payments/pending'); setTransfers(Array.isArray(payload.transfers) ? payload.transfers : []); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load pending transfers.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (visible) void load(); }, [visible]);

  const finalize = async (transfer: Transfer) => {
    const otp = (codes[transfer.job_id] || '').trim();
    if (!/^\d{4,8}$/.test(otp)) { setError('Enter the transfer verification code sent to the platform account.'); return; }
    setBusyId(transfer.job_id); setError('');
    try {
      await request(`/admin/jobs/${encodeURIComponent(transfer.job_id)}/finalize-payment`, { method: 'POST', body: JSON.stringify({ otp }) });
      setCodes((current) => ({ ...current, [transfer.job_id]: '' })); await load();
    } catch (finalizeError) { setError(finalizeError instanceof Error ? finalizeError.message : 'Could not verify transfer.'); }
    finally { setBusyId(''); }
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <View style={styles.header}><Text style={[styles.title, { color: palette.foreground }]}>Payment transfers</Text><Pressable onPress={() => void load()}><Text style={[styles.refresh, { color: palette.tint }]}>Refresh</Text></Pressable></View>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Transfers that Paystack is waiting for a platform administrator to verify.</Text>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator color={palette.tint} /> : null}
        {!loading && !transfers.length && !error ? <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>No transfers need OTP verification.</Text> : null}
        {transfers.map((transfer) => <View key={transfer.id} style={[styles.card, { borderColor: palette.border, backgroundColor: palette.background }]}>
          <Text style={[styles.jobTitle, { color: palette.foreground }]}>{transfer.jobs?.title || 'Completed job'}</Text>
          <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>₦{Number(transfer.amount_ngn).toLocaleString()} · {new Date(transfer.created_at).toLocaleString()}</Text>
          <TextInput value={codes[transfer.job_id] || ''} onChangeText={(value) => setCodes((current) => ({ ...current, [transfer.job_id]: value.replace(/\D/g, '').slice(0, 8) }))} keyboardType="number-pad" placeholder="Platform transfer OTP" placeholderTextColor={palette.mutedForeground} style={[styles.input, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.card }]} />
          <Pressable disabled={busyId === transfer.job_id} onPress={() => void finalize(transfer)} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busyId === transfer.job_id ? 'Verifying…' : 'Finalize Paystack transfer'}</Text></Pressable>
        </View>)}
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
        <Pressable onPress={onClose} style={[styles.button, { borderWidth: 1, borderColor: palette.border }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>Done</Text></Pressable>
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 20, fontFamily: 'Inter_700Bold' }, refresh: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  subtitle: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 5 }, list: { gap: 12, paddingVertical: 14 },
  card: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 10 }, jobTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 13, fontFamily: 'Inter_400Regular' },
  button: { minHeight: 44, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, buttonText: { fontSize: 12, fontFamily: 'Inter_700Bold' }, error: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
});
