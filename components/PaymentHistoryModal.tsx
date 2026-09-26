import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Payment = { id: string; job_id: string; amount_ngn: number; amount_released_ngn: number; status: string; funded_at?: string | null; released_at?: string | null; created_at: string; jobs?: { title?: string } | null };

export default function PaymentHistoryModal({ visible, onClose, getToken, palette, onOpenJob }: {
  visible: boolean; onClose: () => void; getToken: () => Promise<string | null>; palette: Palette; onOpenJob: (jobId: string) => void;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const load = async () => {
    setLoading(true); setError('');
    try {
      if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to load payment history.');
      const token = await getToken();
      if (!token) throw new Error('Sign in again to load payment history.');
      const response = await fetch(`${apiBase}/api/payments/me`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load payment history.');
      setPayments(Array.isArray(payload.payments) ? payload.payments : []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load payment history.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (visible) void load(); }, [visible]);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <View style={styles.header}><View><Text style={[styles.title, { color: palette.foreground }]}>Payment history</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Paystack job funding and completed provider transfers.</Text></View><Pressable onPress={onClose}><Text style={[styles.close, { color: palette.tint }]}>Done</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.list}>
        {loading ? <ActivityIndicator color={palette.tint} /> : null}
        {!loading && payments.length === 0 && !error ? <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>No job payments have been started.</Text> : null}
        {payments.map((payment) => <View key={payment.id} style={[styles.card, { backgroundColor: palette.background, borderColor: palette.border }]}>
          <View style={styles.paymentTop}><Text style={[styles.jobTitle, { color: palette.foreground }]}>{payment.jobs?.title || 'Handyskillz job'}</Text><Text style={[styles.amount, { color: palette.tint }]}>₦{Number(payment.amount_ngn).toLocaleString()}</Text></View>
          <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>{payment.status.replace('_', ' ')} · {new Date(payment.funded_at || payment.created_at).toLocaleString()}</Text>
          {payment.status === 'released' ? <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Transferred to provider on {payment.released_at ? new Date(payment.released_at).toLocaleString() : '—'}</Text> : null}
          <Pressable onPress={() => { onClose(); onOpenJob(payment.job_id); }}><Text style={[styles.viewJob, { color: palette.tint }]}>Open job and payment status</Text></Pressable>
        </View>)}
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
        <Pressable onPress={() => void load()} style={[styles.button, { borderWidth: 1, borderColor: palette.border }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>Refresh</Text></Pressable>
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' }, sheet: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 }, header: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, title: { fontSize: 20, fontFamily: 'Inter_700Bold' }, subtitle: { fontSize: 11, lineHeight: 16, marginTop: 4, fontFamily: 'Inter_400Regular' }, close: { fontSize: 12, fontFamily: 'Inter_700Bold' }, list: { gap: 10, paddingTop: 14 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 7 }, paymentTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, jobTitle: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' }, amount: { fontSize: 13, fontFamily: 'Inter_700Bold' }, viewJob: { fontSize: 11, fontFamily: 'Inter_600SemiBold', paddingTop: 4 },
  button: { minHeight: 42, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, buttonText: { fontSize: 11, fontFamily: 'Inter_700Bold' }, error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});
