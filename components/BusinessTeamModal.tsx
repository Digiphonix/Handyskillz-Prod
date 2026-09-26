import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type colors from '@/constants/colors';

type Palette = typeof colors.dark;
type TeamData = { organization: null | { id: string; name: string; role: string }; members: { userId: string; name: string; email: string; role: string }[]; invitations: { id: string; email: string; role: string }[] };

export default function BusinessTeamModal({ visible, onClose, getToken, palette }: { visible: boolean; onClose: () => void; getToken: () => Promise<string | null>; palette: Palette }) {
  const [team, setTeam] = useState<TeamData | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const request = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to manage your business team.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to manage your business team.');
    const response = await fetch(`${apiBase}/api/business/team${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Business team request failed.');
    return data;
  }, [apiBase, getToken]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setTeam(await request('')); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load business team.'); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { if (visible) void load(); }, [visible, load]);
  const mutate = async (path: string, method: string, body?: unknown): Promise<boolean> => {
    setBusy(true); setError('');
    try { await request(path, method, body); await load(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Business team update failed.'); return false; }
    finally { setBusy(false); }
  };
  const field = { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.card };
  const primary = { backgroundColor: palette.primary };
  const isOwner = team?.organization?.role === 'org:admin';
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <View style={styles.header}><View><Text style={[styles.title, { color: palette.foreground }]}>Business team</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Invite colleagues to collaborate through Clerk Organizations.</Text></View><Pressable onPress={onClose}><Feather name="x" size={22} color={palette.foreground} /></Pressable></View>
      {loading ? <ActivityIndicator color={palette.tint} /> : <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
        {!team?.organization ? <View style={[styles.card, { backgroundColor: palette.card }]}><Text style={[styles.copy, { color: palette.mutedForeground }]}>Create a Clerk organization for this business account to invite and manage team members.</Text><Pressable disabled={busy} onPress={() => void mutate('', 'POST')} style={[styles.button, primary]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Creating...' : 'Create business team'}</Text></Pressable></View> : <>
          <Text style={[styles.orgName, { color: palette.foreground }]}>{team.organization.name}</Text><Text style={[styles.copy, { color: palette.mutedForeground }]}>{team.organization.role === 'org:admin' ? 'Team owner' : 'Team member'}</Text>
          {isOwner ? <View style={styles.inviteRow}><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="colleague@example.com" placeholderTextColor={palette.mutedForeground} style={[styles.input, field]} /><Pressable disabled={busy || !email.trim()} onPress={() => void mutate('/invitations', 'POST', { email }).then((success) => { if (success) setEmail(''); })} style={[styles.smallButton, primary]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>Invite</Text></Pressable></View> : null}
          <Text style={[styles.section, { color: palette.foreground }]}>Members</Text>
          {team.members.map((member) => <View key={member.userId} style={[styles.row, { borderColor: palette.border }]}><View style={styles.rowCopy}><Text style={[styles.memberName, { color: palette.foreground }]}>{member.name}</Text><Text style={[styles.copy, { color: palette.mutedForeground }]}>{member.email} · {member.role.replace('org:', '')}</Text></View>{isOwner && member.role !== 'org:admin' ? <Pressable disabled={busy} onPress={() => void mutate(`/members/${encodeURIComponent(member.userId)}`, 'DELETE')}><Feather name="user-minus" size={18} color={palette.destructive} /></Pressable> : null}</View>)}
          <Text style={[styles.section, { color: palette.foreground }]}>Pending invitations</Text>
          {team.invitations.length ? team.invitations.map((invitation) => <View key={invitation.id} style={[styles.row, { borderColor: palette.border }]}><View style={styles.rowCopy}><Text style={[styles.memberName, { color: palette.foreground }]}>{invitation.email}</Text><Text style={[styles.copy, { color: palette.mutedForeground }]}>Invitation pending</Text></View>{isOwner ? <Pressable disabled={busy} onPress={() => void mutate(`/invitations/${encodeURIComponent(invitation.id)}`, 'DELETE')}><Feather name="x-circle" size={18} color={palette.destructive} /></Pressable> : null}</View>) : <Text style={[styles.copy, { color: palette.mutedForeground }]}>No pending invitations.</Text>}
        </>}
      </ScrollView>}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({ root: { flex: 1, paddingTop: 22, paddingHorizontal: 20 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 18 }, title: { fontSize: 20, fontWeight: '700' }, subtitle: { fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 300 }, content: { gap: 14, paddingBottom: 30 }, card: { padding: 16, borderRadius: 16, gap: 14 }, copy: { fontSize: 12, lineHeight: 18 }, button: { borderRadius: 22, minHeight: 46, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }, buttonText: { fontSize: 13, fontWeight: '700' }, orgName: { fontSize: 18, fontWeight: '700' }, inviteRow: { flexDirection: 'row', gap: 8 }, input: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 13 }, smallButton: { borderRadius: 12, minWidth: 80, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, section: { fontSize: 14, fontWeight: '700', marginTop: 8 }, row: { minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }, rowCopy: { flex: 1 }, memberName: { fontSize: 13, fontWeight: '600' }, error: { fontSize: 12, marginBottom: 8 } });
