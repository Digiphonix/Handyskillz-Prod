import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Ticket = { id: string; subject: string; message: string; status: string; created_at: string };

export default function SupportModal({ visible, onClose, getToken, palette, isAdmin = false }: {
  visible: boolean; onClose: () => void; getToken: () => Promise<string | null>; palette: Palette; isAdmin?: boolean;
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const request = async (path: string, init?: RequestInit) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to contact support.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to view support requests.');
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init?.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}/api${path}`, { ...init, headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Support request failed.');
    return payload;
  };
  const load = async () => {
    setBusy(true); setError('');
    try { const payload = await request('/support/tickets'); setTickets(Array.isArray(payload.tickets) ? payload.tickets : []); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load support requests.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (visible) void load(); }, [visible]);
  const submit = async () => {
    if (!subject.trim() || !message.trim()) { setError('Add a subject and describe how we can help.'); return; }
    setBusy(true); setError('');
    try { await request('/support/tickets', { method: 'POST', body: JSON.stringify({ subject, message }) }); setSubject(''); setMessage(''); await load(); }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Could not send your support request.'); setBusy(false); }
  };
  const setStatus = async (id: string, status: string) => {
    setBusy(true); setError('');
    try { await request(`/support/tickets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); }
    catch (updateError) { setError(updateError instanceof Error ? updateError.message : 'Could not update request.'); setBusy(false); }
  };
  const inputStyle = [styles.input, { color: palette.foreground, backgroundColor: palette.background, borderColor: palette.border }];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <View style={styles.header}><View><Text style={[styles.title, { color: palette.foreground }]}>{isAdmin ? 'Support inbox' : 'Help and support'}</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>{isAdmin ? 'Review and resolve customer requests.' : 'Send a request directly to the Handyskillz support team.'}</Text></View><Pressable onPress={onClose}><Text style={[styles.close, { color: palette.tint }]}>Done</Text></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {!isAdmin ? <View style={[styles.form, { backgroundColor: palette.background }]}>
          <TextInput value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={palette.mutedForeground} style={inputStyle} />
          <TextInput value={message} onChangeText={setMessage} multiline placeholder="Describe your issue" placeholderTextColor={palette.mutedForeground} style={[inputStyle, styles.message]} />
          <Pressable disabled={busy} onPress={() => void submit()} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Sending…' : 'Send support request'}</Text></Pressable>
        </View> : null}
        {tickets.map((ticket) => <View key={ticket.id} style={[styles.ticket, { backgroundColor: palette.background, borderColor: palette.border }]}>
          <Text style={[styles.ticketSubject, { color: palette.foreground }]}>{ticket.subject}</Text>
          <Text style={[styles.ticketMessage, { color: palette.mutedForeground }]}>{ticket.message}</Text>
          <Text style={[styles.ticketStatus, { color: palette.tint }]}>{ticket.status.replace('_', ' ').toUpperCase()} · {new Date(ticket.created_at).toLocaleDateString()}</Text>
          {isAdmin && ticket.status !== 'resolved' ? <View style={styles.actions}><Pressable disabled={busy} onPress={() => void setStatus(ticket.id, 'in_progress')}><Text style={[styles.action, { color: palette.tint }]}>Mark in progress</Text></Pressable><Pressable disabled={busy} onPress={() => void setStatus(ticket.id, 'resolved')}><Text style={[styles.action, { color: palette.tint }]}>Resolve</Text></Pressable></View> : null}
        </View>)}
        {!busy && tickets.length === 0 && isAdmin ? <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>No support requests yet.</Text> : null}
        {busy && tickets.length === 0 ? <ActivityIndicator color={palette.tint} /> : null}
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 11, lineHeight: 16, marginTop: 4, fontFamily: 'Inter_400Regular' },
  close: { fontSize: 12, fontFamily: 'Inter_700Bold', paddingVertical: 5 },
  content: { gap: 10 },
  form: { padding: 11, borderRadius: 14, gap: 8 },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, fontSize: 12, fontFamily: 'Inter_400Regular' },
  message: { minHeight: 85, textAlignVertical: 'top', paddingTop: 10 },
  button: { minHeight: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  ticket: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 5 },
  ticketSubject: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  ticketMessage: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  ticketStatus: { fontSize: 9, fontFamily: 'Inter_700Bold', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 6 },
  action: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});
