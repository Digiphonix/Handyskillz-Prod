import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import colors from '@/constants/colors';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

type Palette = typeof colors.dark;
type NotificationItem = { id: string; title: string; body: string; data: Record<string, unknown>; read_at: string | null; created_at: string };

export default function NotificationsModal({ visible, onClose, getToken, palette, onOpenConversation, onOpenJob, onOpenSupport }: {
  visible: boolean; onClose: () => void; getToken: () => Promise<string | null>; palette: Palette; onOpenConversation: (id: string) => void; onOpenJob: (id: string) => void; onOpenSupport: () => void;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const request = async (path: string, init?: RequestInit) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to load notifications.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to load notifications.');
    const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${token}`);
    if (init?.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}/api${path}`, { ...init, headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Notification request failed.');
    return payload;
  };
  const load = async () => {
    setBusy(true); setError('');
    try {
      const payload = await request('/notifications'); setItems(Array.isArray(payload.notifications) ? payload.notifications : []);
      if (Platform.OS !== 'web') { const pushStatus = await request('/notifications/push-token/status'); setPushEnabled(Boolean(pushStatus.enabled)); }
    }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load notifications.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (visible) void load(); }, [visible]);
  const enablePush = async () => {
    setBusy(true); setError('');
    try {
      if (Platform.OS === 'web') throw new Error('Remote push notifications are available in the iOS and Android app.');
      const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
      if (!projectId) throw new Error('Set EXPO_PUBLIC_EAS_PROJECT_ID to your EAS project ID, then rebuild the native app.');
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Allow notifications in your device settings to enable push alerts.');
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Handyskillz updates', importance: Notifications.AndroidImportance.DEFAULT });
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await request('/notifications/push-token', { method: 'POST', body: JSON.stringify({ token, platform: Platform.OS }) });
      setPushEnabled(true);
    } catch (pushError) { setError(pushError instanceof Error ? pushError.message : 'Could not enable push notifications.'); }
    finally { setBusy(false); }
  };
  const disablePush = async () => {
    setBusy(true); setError('');
    try {
      const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
      if (!projectId || Platform.OS === 'web') throw new Error('Push notification registration is unavailable on this device.');
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await request('/notifications/push-token', { method: 'DELETE', body: JSON.stringify({ token }) });
      setPushEnabled(false);
    } catch (pushError) { setError(pushError instanceof Error ? pushError.message : 'Could not disable push notifications.'); }
    finally { setBusy(false); }
  };
  const markAllRead = async () => {
    setBusy(true); setError('');
    try { await request('/notifications/read-all', { method: 'POST' }); await load(); }
    catch (readError) { setError(readError instanceof Error ? readError.message : 'Could not update notifications.'); setBusy(false); }
  };
  const openItem = async (item: NotificationItem) => {
    try {
      if (!item.read_at) await request(`/notifications/${encodeURIComponent(item.id)}/read`, { method: 'PATCH' });
      if (typeof item.data?.conversationId === 'string') { onClose(); onOpenConversation(item.data.conversationId); }
      else if (typeof item.data?.jobId === 'string') { onClose(); onOpenJob(item.data.jobId); }
      else if (typeof item.data?.ticketId === 'string') { onClose(); onOpenSupport(); }
      else void load();
    } catch (openError) { setError(openError instanceof Error ? openError.message : 'Could not open notification.'); }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <View style={styles.header}><View><Text style={[styles.title, { color: palette.foreground }]}>Notifications</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Messages and support updates for your account.</Text></View><Pressable onPress={onClose}><Text style={[styles.close, { color: palette.tint }]}>Done</Text></Pressable></View>
      <Pressable disabled={busy || Platform.OS === 'web'} onPress={() => void (pushEnabled ? disablePush() : enablePush())} style={[styles.pushToggle, { borderColor: palette.border }]}><Text style={[styles.pushToggleText, { color: palette.foreground }]}>{Platform.OS === 'web' ? 'Push alerts are available in the iOS and Android app' : pushEnabled ? 'Turn off device push alerts' : 'Enable device push alerts'}</Text></Pressable>
      {items.some((item) => !item.read_at) ? <Pressable disabled={busy} onPress={() => void markAllRead()}><Text style={[styles.markRead, { color: palette.tint }]}>Mark all as read</Text></Pressable> : null}
      <ScrollView contentContainerStyle={styles.content}>
        {busy && items.length === 0 ? <ActivityIndicator color={palette.tint} /> : null}
        {items.map((item) => <Pressable key={item.id} onPress={() => void openItem(item)} style={[styles.card, { backgroundColor: palette.background, borderColor: palette.border }, !item.read_at && { borderColor: palette.primary }]}>
          <View style={styles.row}><Text style={[styles.itemTitle, { color: palette.foreground }]}>{item.title}</Text>{!item.read_at ? <View style={[styles.dot, { backgroundColor: palette.primary }]} /> : null}</View>
          <Text style={[styles.body, { color: palette.mutedForeground }]}>{item.body}</Text>
          <Text style={[styles.date, { color: palette.mutedForeground }]}>{new Date(item.created_at).toLocaleString()}</Text>
        </Pressable>)}
        {!busy && items.length === 0 && !error ? <Text style={[styles.empty, { color: palette.mutedForeground }]}>You’re all caught up.</Text> : null}
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '88%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 9 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 11, lineHeight: 16, marginTop: 4, fontFamily: 'Inter_400Regular' },
  close: { fontSize: 12, fontFamily: 'Inter_700Bold', paddingVertical: 5 },
  markRead: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 9 },
  pushToggle: { minHeight: 42, borderWidth: 1, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 12, marginBottom: 10 },
  pushToggleText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  content: { gap: 9 },
  card: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  itemTitle: { flex: 1, fontSize: 12, fontFamily: 'Inter_700Bold' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  body: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  date: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  empty: { fontSize: 12, paddingVertical: 15, fontFamily: 'Inter_400Regular' },
  error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});
