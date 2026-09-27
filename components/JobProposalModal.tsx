import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Job = { id: string; title: string; description: string; category: string; location?: string | null; budget_min_ngn?: number | null; budget_max_ngn?: number | null; status: string; selected_provider_id?: string | null };
type Bid = { id: string; provider_id: string; amount_ngn: number; message: string; status: string; profiles?: { display_name?: string; role?: string; city?: string; rating?: number } | null };
type Payment = { amount_ngn: number; amount_released_ngn: number; status: string; release_status: string; funded_at?: string | null; released_at?: string | null };

export default function JobProposalModal({ visible, job, role, userId, email, onClose, onStartConversation, onTrackJob, getToken, palette }: {
  visible: boolean; job: Job | null; role: string; onClose: () => void; onStartConversation: (providerId: string, jobId: string) => void;
  userId: string | null | undefined; email: string; onTrackJob: (jobId: string) => void;
  getToken: () => Promise<string | null>; palette: Palette;
}) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [jobStatus, setJobStatus] = useState(job?.status || 'open');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const providerMode = ['artisan', 'professional', 'business'].includes(role);
  const inputStyle = [styles.input, { color: palette.foreground, backgroundColor: palette.background, borderColor: palette.border }];

  const request = async (path: string, init?: RequestInit) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to manage job proposals.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to manage job proposals.');
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init?.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}/api${path}`, { ...init, headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Job proposal request failed.');
    return payload;
  };

  const load = async () => {
    if (!job) return;
    setLoading(true); setError('');
    try {
      const payload = await request(`/jobs/${encodeURIComponent(job.id)}/bids`);
      setBids(Array.isArray(payload.bids) ? payload.bids : []);
      setCanManage(Boolean(payload.canManage));
      setJobStatus(job.status);
      if (payload.canManage || job.selected_provider_id === userId) {
        const paymentPayload = await request(`/jobs/${encodeURIComponent(job.id)}/payment`);
        setPayment(paymentPayload.payment || null);
      } else setPayment(null);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load proposals.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (visible && job) void load(); }, [visible, job?.id, userId]);

  const isSelectedProvider = job?.selected_provider_id === userId;
  const changeJobStatus = async (action: 'start' | 'complete') => {
    if (!job) return;
    setBusy(true); setError('');
    try {
      const payload = await request(`/jobs/${encodeURIComponent(job.id)}/${action}`, { method: 'POST' });
      setJobStatus(payload.job.status);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'Could not update job status.'); }
    finally { setBusy(false); }
  };

  const fundJob = async () => {
    if (!job) return;
    if (!email) { setError('Add and verify an email address on your Clerk account before paying.'); return; }
    setBusy(true); setError('');
    try {
      const payload = await request(`/jobs/${encodeURIComponent(job.id)}/fund`, { method: 'POST', body: JSON.stringify({ email }) });
      if (!payload.authorizationUrl) throw new Error('Paystack did not return a checkout link.');
      await Linking.openURL(payload.authorizationUrl);
      await load();
    } catch (fundError) { setError(fundError instanceof Error ? fundError.message : 'Could not open Paystack checkout.'); }
    finally { setBusy(false); }
  };

  const releasePayment = async () => {
    if (!job) return;
    setBusy(true); setError('');
    try {
      await request(`/jobs/${encodeURIComponent(job.id)}/release-payment`, { method: 'POST' });
      const payload = await request(`/jobs/${encodeURIComponent(job.id)}/payment`);
      setPayment(payload.payment || null);
    } catch (releaseError) { setError(releaseError instanceof Error ? releaseError.message : 'Could not approve payment.'); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!job) return;
    const value = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0 || !message.trim()) { setError('Enter your proposed amount and explain how you would do the work.'); return; }
    setBusy(true); setError('');
    try {
      await request(`/jobs/${encodeURIComponent(job.id)}/bids`, { method: 'POST', body: JSON.stringify({ amountNgn: value, message: message.trim() }) });
      setAmount(''); setMessage(''); await load();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Could not submit proposal.'); }
    finally { setBusy(false); }
  };

  const accept = async (bid: Bid) => {
    if (!job) return;
    setBusy(true); setError('');
    try {
      await request(`/jobs/${encodeURIComponent(job.id)}/bids/${encodeURIComponent(bid.id)}/accept`, { method: 'POST' });
      onStartConversation(bid.provider_id, job.id);
      onClose();
    } catch (acceptError) { setError(acceptError instanceof Error ? acceptError.message : 'Could not accept proposal.'); }
    finally { setBusy(false); }
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <Text style={[styles.title, { color: palette.foreground }]}>{job?.title || 'Job details'}</Text>
      {job ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={[styles.meta, { color: palette.mutedForeground }]}>{job.category} · {job.location || 'Location not set'}{job.budget_max_ngn ? ` · Budget up to ₦${Number(job.budget_max_ngn).toLocaleString()}` : ''}</Text>
        <Text style={[styles.description, { color: palette.foreground }]}>{job.description}</Text>
        {['matched', 'in_progress'].includes(jobStatus) ? <Pressable accessibilityRole="button" onPress={() => onTrackJob(job.id)} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{isSelectedProvider ? 'Share location / Job tracking' : 'Track provider on map'}</Text></Pressable> : null}
        {providerMode && jobStatus === 'open' ? <View style={[styles.proposalForm, { borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.foreground }]}>Submit or update your proposal</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="Your price in NGN" placeholderTextColor={palette.mutedForeground} style={inputStyle} />
          <TextInput value={message} onChangeText={setMessage} multiline maxLength={3000} placeholder="Explain your experience and approach" placeholderTextColor={palette.mutedForeground} style={[inputStyle, styles.multiline]} />
          <Pressable disabled={busy} onPress={() => void submit()} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Submitting…' : 'Send proposal'}</Text></Pressable>
        </View> : null}
        {canManage || (providerMode && bids.length > 0) ? <>
          <Text style={[styles.sectionTitle, { color: palette.foreground }]}>Proposals ({bids.length})</Text>
          {bids.map((bid) => <View key={bid.id} style={[styles.bid, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <View style={styles.bidTop}><Text style={[styles.bidName, { color: palette.foreground }]}>{bid.profiles?.display_name || 'Provider'}</Text><Text style={[styles.bidAmount, { color: palette.tint }]}>₦{Number(bid.amount_ngn).toLocaleString()}</Text></View>
            <Text style={[styles.meta, { color: palette.mutedForeground }]}>{bid.profiles?.role || 'Provider'} · {bid.profiles?.city || 'Location not set'} · {bid.status}</Text>
            <Text style={[styles.description, { color: palette.foreground }]}>{bid.message}</Text>
            {canManage && jobStatus === 'open' && ['pending', 'shortlisted'].includes(bid.status) ? <Pressable disabled={busy} onPress={() => void accept(bid)} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Working…' : 'Accept proposal and message'}</Text></Pressable> : null}
          </View>)}
          {!bids.length ? <Text style={[styles.meta, { color: palette.mutedForeground }]}>No proposals have been submitted yet.</Text> : null}
        </> : null}
        {canManage || isSelectedProvider ? <View style={[styles.paymentCard, { borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.foreground }]}>Job payment</Text>
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>{payment ? `₦${Number(payment.amount_ngn).toLocaleString()} · ${payment.status.replace('_', ' ')}${payment.release_status === 'processing' || payment.release_status === 'awaiting_otp' ? ' · transfer processing' : ''}` : 'No payment has been started for this job.'}</Text>
          {canManage && jobStatus === 'matched' && !payment ? <Pressable disabled={busy} onPress={() => void fundJob()} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Opening checkout…' : 'Fund job securely with Paystack'}</Text></Pressable> : null}
          {canManage && jobStatus === 'completed' && payment?.status === 'funded' ? <Pressable disabled={busy} onPress={() => void releasePayment()} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Submitting…' : 'Approve work and release payment'}</Text></Pressable> : null}
          {isSelectedProvider && jobStatus === 'matched' && payment?.status === 'funded' ? <Pressable disabled={busy} onPress={() => void changeJobStatus('start')} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Updating…' : 'Start this job'}</Text></Pressable> : null}
          {isSelectedProvider && jobStatus === 'matched' && payment?.status !== 'funded' ? <Text style={[styles.meta, { color: palette.mutedForeground }]}>The customer needs to fund this job before work can start.</Text> : null}
          {isSelectedProvider && jobStatus === 'in_progress' ? <Pressable disabled={busy} onPress={() => void changeJobStatus('complete')} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Updating…' : 'Mark work complete'}</Text></Pressable> : null}
          {(payment?.status === 'pending' || payment?.release_status === 'processing' || payment?.release_status === 'awaiting_otp') ? <Pressable disabled={loading} onPress={() => void load()} style={[styles.button, { borderWidth: 1, borderColor: palette.border }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>{loading ? 'Checking…' : 'Refresh payment status'}</Text></Pressable> : null}
        </View> : null}
        {loading ? <ActivityIndicator color={palette.tint} /> : null}
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
        <Pressable onPress={onClose} style={[styles.button, { borderWidth: 1, borderColor: palette.border }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>Done</Text></Pressable>
      </ScrollView> : null}
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '92%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' }, content: { gap: 12, paddingTop: 10, paddingBottom: 12 },
  meta: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }, description: { fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' }, proposalForm: { gap: 10, borderWidth: 1, borderRadius: 16, padding: 12 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 13, fontFamily: 'Inter_400Regular' }, multiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 },
  bid: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 8 }, paymentCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 }, bidTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, bidName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' }, bidAmount: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  button: { minHeight: 44, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, buttonText: { fontSize: 12, fontFamily: 'Inter_700Bold' }, error: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
});
