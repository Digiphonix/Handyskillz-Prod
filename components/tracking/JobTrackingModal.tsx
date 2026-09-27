import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import TrackingMap from './TrackingMap';

type Palette = typeof colors.dark;
type Job = { id: string; title: string; location: string | null; status: string; selected_provider_id: string };
type Position = { latitude: number; longitude: number; accuracy: number | null; travel_status: 'en_route' | 'arrived'; updated_at: string; expires_at: string };
type Detail = { job: Job; provider: { display_name: string; avatar_url: string | null } | null; canShare: boolean; position: Position | null };
type Request = (path: string, body?: Record<string, unknown>) => Promise<any>;

export default function JobTrackingModal({ onClose, initialJobId, getToken, palette }: {
  onClose: () => void; initialJobId?: string | null; getToken: () => Promise<string | null>; palette: Palette;
}) {
  const insets = useSafeAreaInsets();
  const [jobId, setJobId] = useState(initialJobId || null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useCallback<Request>(async (path, body) => {
    const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
    if (!base) throw new Error('Tracking service is not configured.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to use tracking.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${base}/api/tracking${path}`, {
        method: body ? 'POST' : 'GET', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Tracking service is unavailable.');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Tracking request failed.');
      return payload;
    } finally { clearTimeout(timeout); }
  }, [getToken]);
  const loadJobs = useCallback(async () => {
    setLoading(true); setError('');
    try { const payload = await request('/jobs'); setJobs(payload.jobs); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load jobs.'); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { if (!jobId) void loadJobs(); }, [jobId, loadJobs]);
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <View style={[styles.screen, { backgroundColor: palette.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={jobId ? 'Back to tracking jobs' : 'Close tracking'} onPress={jobId ? () => setJobId(null) : onClose} style={styles.iconButton}><Feather name="arrow-left" size={24} color={palette.foreground} /></Pressable>
        <Text style={[styles.title, { color: palette.foreground, flex: 1 }]}>Job tracking</Text>
        <Pressable accessibilityRole="button" onPress={onClose}><Text style={[styles.buttonText, { color: palette.tint }]}>Done</Text></Pressable>
      </View>
      {jobId ? <TrackingDetail key={jobId} jobId={jobId} request={request} palette={palette} /> : <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: palette.foreground }]}>Your provider, on the map</Text>
        <Text style={[styles.copy, { color: palette.mutedForeground }]}>Choose an assigned job. Providers control when their location is shared.</Text>
        {loading ? <ActivityIndicator color={palette.tint} /> : null}
        {jobs.map((job) => <Pressable key={job.id} accessibilityRole="button" onPress={() => setJobId(job.id)} style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.row}><Feather name="map-pin" size={22} color={palette.tint} /><Text style={[styles.title, { color: palette.foreground, flex: 1 }]}>{job.title}</Text><Feather name="chevron-right" size={20} color={palette.foreground} /></View>
          <Text style={[styles.copy, { color: palette.mutedForeground }]}>{job.location || 'Job location not provided'} · {job.status.replace('_', ' ')}</Text>
        </Pressable>)}
        {!loading && !jobs.length && !error ? <Text style={[styles.copy, { color: palette.mutedForeground }]}>No active assigned jobs yet. Tracking becomes available after a provider is selected.</Text> : null}
        {error ? <Text accessibilityRole="alert" style={[styles.copy, { color: palette.destructive }]}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => void loadJobs()} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>Refresh jobs</Text></Pressable>
      </ScrollView>}
    </View>
  </Modal>;
}

function TrackingDetail({ jobId, request, palette }: { jobId: string; request: Request; palette: Palette }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [shareError, setShareError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [travelStatus, setTravelStatus] = useState<'en_route' | 'arrived'>('en_route');
  const travel = useRef(travelStatus);
  travel.current = travelStatus;
  const session = useRef<string | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const endpoint = `/jobs/${encodeURIComponent(jobId)}`;
  const requestRef = useRef(request);
  requestRef.current = request;
  const stop = useCallback(async () => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    const previous = session.current;
    session.current = null;
    if (alive.current) {
      setSharing(false); setBusy(false);
      if (previous) setDetail((value) => value ? { ...value, position: null } : value);
    }
    if (previous) {
      try { await requestRef.current(endpoint, { action: 'stop', sessionId: previous }); }
      catch { if (alive.current) setShareError('Sharing stopped on this device. The last location will disappear within 90 seconds if the server is offline.'); }
    }
  }, [endpoint]);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    let poll: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const result: Detail = await requestRef.current(endpoint);
        if (!cancelled) {
          setDetail(result); setError('');
          if (!result.canShare && session.current) void stop();
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not refresh location.'); }
      finally { if (!cancelled) poll = setTimeout(load, 10000); }
    };
    void load();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const appState = AppState.addEventListener('change', (state) => {
      // Permission dialogs can temporarily make iOS inactive before sharing starts.
      if (state === 'background' || (state === 'inactive' && session.current)) void stop();
    });
    const hidden = () => { if (document.hidden) void stop(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', hidden);
    return () => {
      alive.current = false; cancelled = true; clearTimeout(poll); clearInterval(clock);
      appState.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', hidden);
      void stop();
    };
  }, [endpoint, stop]);

  const start = async () => {
    if (busy || sharing || !detail?.canShare) return;
    const current = ++generation.current;
    setBusy(true); setShareError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Allow location access to share your position with this customer.');
      if (!alive.current || current !== generation.current) return;
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (!alive.current || current !== generation.current) return;
      const result = await requestRef.current(endpoint, { action: 'start' });
      if (!alive.current || current !== generation.current) {
        await requestRef.current(endpoint, { action: 'stop', sessionId: result.sessionId }); return;
      }
      session.current = result.sessionId;
      setSharing(true); setTravelStatus('en_route'); travel.current = 'en_route';
      const publish = async (initial?: Location.LocationObject) => {
        if (!alive.current || current !== generation.current) return;
        try {
          const location = initial || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          if (!alive.current || current !== generation.current) return;
          if (Date.now() - location.timestamp > 30000) throw new Error('GPS location is out of date. Move to a clear area and start sharing again.');
          const { latitude, longitude, accuracy } = location.coords;
          await requestRef.current(endpoint, { action: 'update', sessionId: result.sessionId,
            latitude, longitude, accuracy, travelStatus: travel.current });
          if (alive.current && current === generation.current) {
            setShareError('');
            setDetail((previous) => previous ? { ...previous, position: { latitude, longitude, accuracy,
              travel_status: travel.current, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 90000).toISOString() } } : previous);
            timer.current = setTimeout(() => void publish(), 10000);
          }
        } catch (e) {
          if (alive.current && current === generation.current) {
            setShareError(e instanceof Error ? e.message : 'Location update failed. Start sharing again.');
            await stop();
          }
        }
      };
      await publish(first);
    } catch (e) { if (alive.current && current === generation.current) setShareError(e instanceof Error ? e.message : 'Could not start location sharing.'); }
    finally { if (alive.current && current === generation.current) setBusy(false); }
  };
  const position = detail?.position && Date.parse(detail.position.expires_at) > now ? detail.position : null;
  const age = position ? Math.max(0, Math.floor((now - Date.parse(position.updated_at)) / 1000)) : 0;
  const recent = position && age <= 30 && !error;
  return <ScrollView contentContainerStyle={styles.content}>
    <View style={[styles.map, { borderColor: palette.border }]}><TrackingMap point={position} /></View>
    {!detail && !error ? <ActivityIndicator color={palette.tint} /> : null}
    {detail ? <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.row}>
        {detail.provider?.avatar_url ? <Image source={{ uri: detail.provider.avatar_url }} style={styles.avatar} /> : <Feather name="user" size={30} color={palette.tint} />}
        <View style={{ flex: 1 }}><Text style={[styles.title, { color: palette.foreground }]}>{detail.provider?.display_name || 'Assigned provider'}</Text><Text style={[styles.copy, { color: palette.mutedForeground }]}>{detail.job.title}</Text></View>
      </View>
      <Text style={[styles.status, { color: palette.tint }]}>{position ? `${recent ? 'Live' : 'Last known location'} · ${position.travel_status === 'arrived' ? 'Arrived' : 'On the way'}` : ['matched', 'in_progress'].includes(detail.job.status) ? 'Location sharing is off or unavailable' : 'This job has ended — tracking closed'}</Text>
      <Text style={[styles.copy, { color: palette.mutedForeground }]}>{position ? `Updated ${age}s ago${position.accuracy != null ? ` · GPS accuracy ±${Math.round(position.accuracy)} m` : ''}` : 'The map updates when the assigned provider starts sharing.'}</Text>
      <Text style={[styles.copy, { color: palette.mutedForeground }]}>Job address: {detail.job.location || 'Not provided'}</Text>
      {position ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${position.latitude},${position.longitude}`).catch(() => setShareError('Could not open maps.'))}><Text style={[styles.buttonText, { color: palette.tint }]}>Open provider location in Maps</Text></Pressable> : null}
      {detail.canShare ? <>
        <Text style={[styles.copy, { color: palette.mutedForeground }]}>Share with this job's customer and platform admin. Keep this screen open; leaving it or putting the app in the background stops sharing.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void (sharing ? stop() : start())} style={[styles.button, { backgroundColor: sharing ? palette.secondary : palette.primary }]}>
          <Text style={[styles.buttonText, { color: sharing ? palette.foreground : palette.primaryForeground }]}>{busy ? 'Getting your location...' : sharing ? 'Stop sharing location' : 'Share my live location'}</Text>
        </Pressable>
        {sharing ? <View style={styles.row}>{(['en_route', 'arrived'] as const).map((status) => <Pressable accessibilityRole="button" accessibilityState={{ selected: travelStatus === status }} key={status} onPress={() => setTravelStatus(status)} style={[styles.button, { flex: 1, backgroundColor: travelStatus === status ? palette.primary : palette.secondary }]}><Text style={[styles.buttonText, { color: travelStatus === status ? palette.primaryForeground : palette.foreground }]}>{status === 'arrived' ? "I've arrived" : 'On the way'}</Text></Pressable>)}</View> : null}
      </> : null}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={[styles.copy, { color: palette.destructive }]}>{error} Retrying automatically.</Text> : null}
    {shareError ? <Text accessibilityRole="alert" style={[styles.copy, { color: palette.destructive }]}>{shareError}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, minHeight: 60 },
  iconButton: { padding: 8 }, content: { padding: 16, gap: 16, maxWidth: 900, width: '100%', alignSelf: 'center', paddingBottom: 32 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 }, copy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20 },
  status: { fontFamily: 'Inter_700Bold', fontSize: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { padding: 18, borderRadius: 22, borderWidth: 1, gap: 14 }, map: { height: 360, borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  avatar: { width: 50, height: 50, borderRadius: 25 }, button: { padding: 14, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
});
