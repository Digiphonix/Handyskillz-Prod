import { formatListingPrice } from '@/constants/listings';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import colors from '@/constants/colors';
type Palette = typeof colors.dark;
type Props = { getToken: () => Promise<string | null>; palette: Palette; onOpenJob: (job: any) => void; postedBy?: string; search?: string; limit?: number; refreshKey?: number };

export function JobListings({ getToken, palette, onOpenJob, postedBy, search = '', limit = 3, refreshKey = 0 }: Props) {
  const getTokenRef = useRef(getToken);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 75000);
    setLoading(true); setError(''); setJobs([]);
    void (async () => {
      try {
        const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
        if (!base) throw new Error('Job service is not configured.');
        const token = await getTokenRef.current();
        if (!token) throw new Error('Sign in to view jobs.');
        const params = new URLSearchParams({ status: 'open', search });
        if (postedBy) params.set('postedBy', postedBy);
        const response = await fetch(`${base}/api/jobs?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load jobs.');
        if (!cancelled) setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
      } catch (e) {
        if (!cancelled) setError(controller.signal.aborted ? 'Loading opportunities timed out. Check your connection and retry.' : e instanceof Error ? e.message : 'Could not load jobs.');
      }
      finally { clearTimeout(timeout); if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [postedBy, search, refreshKey, retry]);
  return <View style={styles.list}>
    {loading ? <ActivityIndicator color={palette.tint} /> : null}
    {jobs.slice(0, limit).map((job) => <Pressable accessibilityRole="button" key={job.id} onPress={() => onOpenJob(job)} style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Text style={[styles.title, { color: palette.foreground }]}>{job.title}</Text>
      <Text style={[styles.copy, { color: palette.mutedForeground }]}>{job.category} · {job.location || 'Location not specified'}</Text>
      <Text style={[styles.copy, { color: palette.mutedForeground }]} numberOfLines={2}>{job.description}</Text>
      <Text style={[styles.copy, { color: palette.foreground }]}>{formatListingPrice(job)}</Text>
      <Text style={[styles.action, { color: palette.tint }]}>{job.listing_type === 'service_offer' ? 'View service and enquire' : 'View job and enquire'}</Text>
    </Pressable>)}
    {!loading && !jobs.length && !error ? <Text style={[styles.copy, { color: palette.mutedForeground }]}>No open jobs found.</Text> : null}
    {error ? <><Text style={[styles.copy, { color: palette.destructive }]}>{error}</Text><Pressable onPress={() => setRetry((value) => value + 1)}><Text style={[styles.action, { color: palette.tint }]}>Retry</Text></Pressable></> : null}
  </View>;
}

export function ProviderJobsModal({ provider, onClose, onMessage, ...props }: Omit<Props, 'postedBy'> & { provider: { id: string; name: string }; onClose: () => void; onMessage: () => void }) {
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: props.palette.background }]}>
      <Text style={[styles.title, { color: props.palette.foreground }]}>{provider.name}</Text>
      <Text style={[styles.copy, { color: props.palette.mutedForeground }]}>Services and open listings from this provider</Text>
      <ScrollView contentContainerStyle={styles.list}><JobListings {...props} postedBy={provider.id} limit={100} /></ScrollView>
      <Pressable onPress={onMessage} style={[styles.button, { backgroundColor: props.palette.primary }]}><Text style={[styles.action, { color: props.palette.primaryForeground }]}>Enquire / Message provider</Text></Pressable>
      <Pressable onPress={onClose} style={styles.button}><Text style={[styles.action, { color: props.palette.foreground }]}>Close</Text></Pressable>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  list: { gap: 12 }, card: { borderRadius: 18, borderWidth: 1, padding: 15, gap: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16 }, copy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  action: { fontFamily: 'Inter_600SemiBold', fontSize: 13 }, button: { padding: 15, borderRadius: 24, alignItems: 'center' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 },
});
