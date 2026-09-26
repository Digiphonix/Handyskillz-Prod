import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Session = { id: string; status: string; current: boolean; createdAt: number; lastActiveAt: number; expiresAt: number; deviceType?: string | null; browserName?: string | null; city?: string | null; country?: string | null };

export default function SecuritySessionsModal({ visible, onClose, getToken, palette }: {
  visible: boolean; onClose: () => void; getToken: () => Promise<string | null>; palette: Palette;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const request = async (path: string, init?: RequestInit) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to review account sessions.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to review account sessions.');
    const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${apiBase}/api${path}`, { ...init, headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Security request failed.');
    return payload;
  };
  const load = async () => {
    setLoading(true); setError('');
    try { const payload = await request('/account/security/sessions'); setSessions(Array.isArray(payload.sessions) ? payload.sessions : []); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load account sessions.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (visible) void load(); }, [visible]);
  const revokeOthers = async () => {
    setBusy(true); setError('');
    try { const payload = await request('/account/security/revoke-other-sessions', { method: 'POST' }); await load(); if (payload.failed) setError(`${payload.revoked} sessions revoked; ${payload.failed} could not be revoked.`); }
    catch (revokeError) { setError(revokeError instanceof Error ? revokeError.message : 'Could not revoke other sessions.'); }
    finally { setBusy(false); }
  };
  const date = (timestamp: number) => new Date(timestamp).toLocaleString();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <View style={styles.header}><View><Text style={[styles.title, { color: palette.foreground }]}>Security and sessions</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Review signed-in devices and revoke sessions you do not recognize.</Text></View><Pressable onPress={onClose}><Text style={[styles.close, { color: palette.tint }]}>Done</Text></Pressable></View>
      {sessions.some((session) => !session.current && session.status === 'active') ? <Pressable disabled={busy} onPress={() => void revokeOthers()} style={[styles.revokeButton, { backgroundColor: palette.destructive }]}><Text style={[styles.buttonText, { color: palette.destructiveForeground }]}>{busy ? 'Revoking…' : 'Sign out other devices'}</Text></Pressable> : null}
      <ScrollView contentContainerStyle={styles.list}>
        {loading ? <ActivityIndicator color={palette.tint} /> : null}
        {sessions.map((session) => <View key={session.id} style={[styles.card, { borderColor: palette.border, backgroundColor: palette.background }]}>
          <View style={styles.sessionHeader}><Text style={[styles.device, { color: palette.foreground }]}>{[session.deviceType, session.browserName].filter(Boolean).join(' · ') || 'Signed-in device'}{session.current ? ' · This device' : ''}</Text><Text style={[styles.status, { color: session.status === 'active' ? palette.tint : palette.mutedForeground }]}>{session.status}</Text></View>
          <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Last active {date(session.lastActiveAt)}{session.city || session.country ? ` · ${[session.city, session.country].filter(Boolean).join(', ')}` : ''}</Text>
          <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Signed in {date(session.createdAt)}</Text>
        </View>)}
        {!loading && sessions.length === 0 && !error ? <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>No active sessions were returned by Clerk.</Text> : null}
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
        <Pressable onPress={() => void load()} style={[styles.button, { borderWidth: 1, borderColor: palette.border }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>Refresh sessions</Text></Pressable>
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, title: { fontSize: 20, fontFamily: 'Inter_700Bold' }, subtitle: { fontSize: 11, lineHeight: 16, marginTop: 4, fontFamily: 'Inter_400Regular' }, close: { fontSize: 12, fontFamily: 'Inter_700Bold', paddingVertical: 5 },
  revokeButton: { minHeight: 42, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, list: { gap: 10, paddingTop: 14 }, card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 }, sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, device: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' }, status: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  button: { minHeight: 42, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, buttonText: { fontSize: 11, fontFamily: 'Inter_700Bold' }, error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});
