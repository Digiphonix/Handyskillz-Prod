import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Draft = { displayName: string; phone: string; city: string; bio: string };

export default function ProfileEditorModal({ visible, onClose, onSaved, getToken, palette }: {
  visible: boolean;
  onClose: () => void;
  onSaved: (profile: { display_name?: string | null; avatar_url?: string | null }) => void;
  getToken: () => Promise<string | null>;
  palette: Palette;
}) {
  const [draft, setDraft] = useState<Draft>({ displayName: '', phone: '', city: '', bio: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';

  const request = async (method: 'GET' | 'PATCH', body?: Draft & { avatarUrl?: string }) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to edit your profile.');
    const token = await getToken();
    if (!token) throw new Error('Your session has expired. Sign in again to edit your profile.');
    const response = await fetch(`${apiBase}/api/profile/me`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error(`Profile service returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Profile request failed.');
    return payload;
  };

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setPhoto(null);
    setAvatarUrl('');
    setError('');
    request('GET').then((payload) => {
      const profile = payload.profile || {};
      setAvatarUrl(profile.avatar_url || '');
      setDraft({ displayName: profile.display_name || '', phone: profile.phone || '', city: profile.city || '', bio: profile.bio || '' });
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load your profile.'))
      .finally(() => setLoading(false));
  }, [visible]);

  const pickPhoto = async () => {
    setPicking(true);
    setError('');
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error('Allow photo access to choose a profile photo.');
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.82 });
      if (!result.canceled && result.assets[0]) {
        const selected = result.assets[0];
        if (selected.fileSize && selected.fileSize > 8 * 1024 * 1024) throw new Error('Choose a photo smaller than 8 MB.');
        setPhoto(selected);
      }
    } catch (pickError) { setError(pickError instanceof Error ? pickError.message : 'Could not select a photo.'); }
    finally { setPicking(false); }
  };

  const uploadPhoto = async (selected: ImagePicker.ImagePickerAsset) => {
    if (!apiBase) throw new Error('Profile service is unavailable.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to upload your photo.');
    const body = new FormData();
    const filename = selected.fileName || 'avatar.jpg';
    if (Platform.OS === 'web') {
      const blob = await fetch(selected.uri).then((response) => response.blob());
      body.append('file', blob, filename);
    } else {
      const { File } = await import('expo-file-system');
      body.append('file', new File(selected.uri), filename);
    }
    const response = await fetch(apiBase + '/api/uploads/profile', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Photo upload failed. Please try again.');
    const payload = await response.json();
    if (!response.ok || !payload.url) throw new Error(payload.error || 'Photo upload failed.');
    return payload.url as string;
  };

  const save = async () => {
    if (loading || saving || picking) return;
    if (!draft.displayName.trim()) { setError('Enter your name to continue.'); return; }
    setSaving(true);
    setError('');
    try {
      const uploadedUrl = photo ? await uploadPhoto(photo) : undefined;
      const payload = await request('PATCH', { ...draft, ...(uploadedUrl ? { avatarUrl: uploadedUrl } : {}) });
      onSaved(payload.profile);
      onClose();
    }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save your profile.'); }
    finally { setSaving(false); }
  };

  const field = (key: keyof Draft, label: string, multiline = false) => (
    <TextInput value={draft[key]} onChangeText={(value) => setDraft((current) => ({ ...current, [key]: value }))}
      editable={!saving} placeholder={label} placeholderTextColor={palette.mutedForeground} multiline={multiline}
      style={[styles.input, { color: palette.foreground, backgroundColor: palette.background, borderColor: palette.border }, multiline && styles.bio]} />
  );

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!saving && !picking) onClose(); }}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <Text style={[styles.title, { color: palette.foreground }]}>Edit profile</Text>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Update the details people see on your profile.</Text>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
        {loading ? <ActivityIndicator color={palette.tint} /> : <>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose profile photo" disabled={saving || picking} onPress={() => void pickPhoto()} style={styles.photoPicker}>
            {photo?.uri || avatarUrl ? <Image source={{ uri: photo?.uri || avatarUrl }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: palette.secondary }]}><Text style={{ color: palette.tint, fontSize: 28 }}>+</Text></View>}
            <View style={{ flex: 1 }}><Text style={[styles.buttonText, { color: palette.tint }]}>{picking ? 'Opening photos...' : photo?.uri || avatarUrl ? 'Change profile photo' : 'Add profile photo'}</Text><Text style={[styles.subtitle, { color: palette.mutedForeground, marginBottom: 0 }]}>Choose an image up to 8 MB. Saved with your changes.</Text></View>
          </Pressable>
          {field('displayName', 'Full name')}{field('phone', 'Phone number')}{field('city', 'City or service area')}{field('bio', 'About you', true)}</>}
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable disabled={saving || picking} onPress={onClose} style={[styles.button, { borderColor: palette.border, borderWidth: 1 }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>Cancel</Text></Pressable>
          <Pressable onPress={() => void save()} disabled={loading || saving || picking} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{saving ? 'Saving…' : 'Save changes'}</Text></Pressable>
        </View>
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '86%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 14, fontFamily: 'Inter_400Regular' },
  photoPicker: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  fields: { gap: 10, paddingBottom: 10 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 12, fontFamily: 'Inter_400Regular' },
  bio: { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 5 },
  button: { flex: 1, minHeight: 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});
