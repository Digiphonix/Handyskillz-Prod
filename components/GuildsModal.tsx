import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Guild = { id: string; name: string; description?: string | null; category?: string | null; city?: string | null; joined: boolean; membershipRole?: string | null };

export default function GuildsModal({ visible, onClose, getToken, palette, isAdmin = false }: {
  visible: boolean; onClose: () => void; getToken: () => Promise<string | null>; palette: Palette; isAdmin?: boolean;
}) {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [draft, setDraft] = useState({ name: '', category: '', city: '', description: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';

  const request = async (path: string, init?: RequestInit) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to manage guilds.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to manage guild memberships.');
    const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${token}`);
    if (init?.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}/api${path}`, { ...init, headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Guild request failed.');
    return payload;
  };

  const load = async () => {
    setLoading(true); setError('');
    try { const payload = await request('/guilds'); setGuilds(Array.isArray(payload.guilds) ? payload.guilds : []); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load guilds.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (visible) void load(); }, [visible]);

  const toggleMembership = async (guild: Guild) => {
    setBusy(true); setError('');
    try {
      await request(`/guilds/${encodeURIComponent(guild.id)}/${guild.joined ? 'membership' : 'join'}`, { method: guild.joined ? 'DELETE' : 'POST' });
      await load();
    } catch (membershipError) { setError(membershipError instanceof Error ? membershipError.message : 'Could not update guild membership.'); }
    finally { setBusy(false); }
  };

  const create = async () => {
    if (!draft.name.trim()) { setError('Enter a guild name.'); return; }
    setBusy(true); setError('');
    try {
      await request('/guilds', { method: 'POST', body: JSON.stringify(draft) });
      setDraft({ name: '', category: '', city: '', description: '' }); setShowCreate(false); await load();
    } catch (createError) { setError(createError instanceof Error ? createError.message : 'Could not create guild.'); }
    finally { setBusy(false); }
  };

  const inputStyle = [styles.input, { color: palette.foreground, backgroundColor: palette.background, borderColor: palette.border }];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <View style={styles.header}><View><Text style={[styles.title, { color: palette.foreground }]}>{isAdmin ? 'Guild management' : 'Professional guilds'}</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>{isAdmin ? 'Create guilds that artisans and professionals can join.' : 'Join communities for your trade and service area.'}</Text></View><Pressable onPress={onClose}><Text style={[styles.close, { color: palette.tint }]}>Done</Text></Pressable></View>
      {isAdmin ? <Pressable onPress={() => setShowCreate((value) => !value)} style={[styles.createToggle, { borderColor: palette.border }]}><Text style={[styles.action, { color: palette.tint }]}>{showCreate ? 'Cancel new guild' : 'Create a guild'}</Text></Pressable> : null}
      {showCreate ? <View style={[styles.form, { borderColor: palette.border }]}>
        {(['name', 'category', 'city', 'description'] as const).map((key) => <TextInput key={key} value={draft[key]} onChangeText={(value) => setDraft((current) => ({ ...current, [key]: value }))} placeholder={{ name: 'Guild name', category: 'Trade or profession', city: 'City (optional)', description: 'What members get from this guild' }[key]} placeholderTextColor={palette.mutedForeground} multiline={key === 'description'} style={[inputStyle, key === 'description' && styles.multiline]} />)}
        <Pressable disabled={busy} onPress={() => void create()} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Creating…' : 'Create guild'}</Text></Pressable>
      </View> : null}
      <ScrollView contentContainerStyle={styles.list}>
        {loading ? <ActivityIndicator color={palette.tint} /> : null}
        {!loading && guilds.length === 0 && !error ? <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>No guilds have been created yet.</Text> : null}
        {guilds.map((guild) => <View key={guild.id} style={[styles.card, { backgroundColor: palette.background, borderColor: palette.border }]}>
          <View style={styles.guildTop}><View style={{ flex: 1 }}><Text style={[styles.guildName, { color: palette.foreground }]}>{guild.name}</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>{[guild.category, guild.city].filter(Boolean).join(' · ') || 'Handyskillz community'}</Text></View>{!isAdmin ? <Pressable disabled={busy} onPress={() => void toggleMembership(guild)} style={[styles.memberButton, { backgroundColor: guild.joined ? palette.card : palette.primary, borderColor: palette.border }]}><Text style={[styles.action, { color: guild.joined ? palette.foreground : palette.primaryForeground }]}>{guild.joined ? 'Leave' : 'Join'}</Text></Pressable> : null}</View>
          {guild.description ? <Text style={[styles.description, { color: palette.mutedForeground }]}>{guild.description}</Text> : null}
        </View>)}
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
        <Pressable onPress={() => void load()} style={[styles.button, { borderWidth: 1, borderColor: palette.border }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>Refresh</Text></Pressable>
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, title: { fontSize: 20, fontFamily: 'Inter_700Bold' }, subtitle: { fontSize: 11, lineHeight: 16, marginTop: 4, fontFamily: 'Inter_400Regular' }, close: { fontSize: 12, fontFamily: 'Inter_700Bold', paddingVertical: 5 },
  createToggle: { minHeight: 40, borderWidth: 1, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 12, marginTop: 12 }, form: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 9, marginTop: 10 },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, fontSize: 12, fontFamily: 'Inter_400Regular' }, multiline: { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 },
  list: { gap: 10, paddingTop: 14 }, card: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 8 }, guildTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, guildName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' }, description: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  memberButton: { minWidth: 70, minHeight: 34, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }, action: { fontSize: 11, fontFamily: 'Inter_600SemiBold' }, button: { minHeight: 43, borderRadius: 23, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, buttonText: { fontSize: 12, fontFamily: 'Inter_700Bold' }, error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});
