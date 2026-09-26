import React, { useMemo, useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import colors from '@/constants/colors';

type Role = 'customer' | 'artisan' | 'professional' | 'business';
type PortfolioDraft = { title: string; description: string; uri: string };

const lime = colors.dark.primary;
const ink = colors.dark.background;
const panel = colors.dark.card;
const text = colors.dark.foreground;
const muted = colors.dark.mutedForeground;
const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';

async function readApiResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `The profile API returned a non-JSON response (HTTP ${response.status}). Set EXPO_PUBLIC_API_URL to your running API server and restart Expo.`,
    );
  }
  return response.json() as Promise<Record<string, unknown>>;
}

async function uploadImage(uri: string, token: string | null, prefix: string): Promise<string> {
  const body = new FormData();
  const filename = `${prefix}-${Date.now()}.jpg`;
  if (Platform.OS === 'web') {
    const image = await fetch(uri).then((response) => response.blob());
    body.append('file', image, filename);
  } else {
    // Expo's fetch implementation requires Blob-compatible parts; React Native's
    // { uri, name, type } FormData extension is rejected by its multipart encoder.
    const { File } = await import('expo-file-system');
    body.append('file', new File(uri), filename);
  }
  const response = await fetch(`${apiBase}/api/uploads/profile`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body,
  });
  const payload = await readApiResponse(response);
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Image upload failed');
  return typeof payload.url === 'string' ? payload.url : '';
}

export default function ProfileSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const [role, setRole] = useState<Role>('customer');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Lagos');
  const [bio, setBio] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [avatarUri, setAvatarUri] = useState('');
  const [portfolio, setPortfolio] = useState<PortfolioDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isProvider = role !== 'customer';
  const roleOptions = useMemo(() => [
    { id: 'customer' as const, label: 'I need a skilled expert', icon: '⌕' },
    { id: 'artisan' as const, label: 'I offer hands-on services', icon: '✦' },
    { id: 'professional' as const, label: 'I offer professional services', icon: '◎' },
    { id: 'business' as const, label: 'I hire for a business', icon: '▦' },
  ], []);

  const pickImage = async (callback: (uri: string) => void) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to add a profile or portfolio image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.82,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]?.uri) callback(result.assets[0].uri);
  };

  const addPortfolio = () => {
    if (portfolio.length >= 6) return;
    setPortfolio((items) => [...items, { title: '', description: '', uri: '' }]);
  };

  const save = async () => {
    if (!displayName.trim()) {
      setError('Add your name before continuing.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const token = await getToken();
      const avatarUrl = avatarUri ? await uploadImage(avatarUri, token, 'avatar') : '';
      const portfolioWithUploads = await Promise.all(portfolio.map(async (item, index) => ({
        ...item,
        imageUrl: item.uri ? await uploadImage(item.uri, token, `portfolio-${index + 1}`) : '',
      })));
      const response = await fetch(`${apiBase}/api/profile/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          displayName,
          phone,
          city,
          bio,
          role,
          skills: skillsText.split(',').map((item) => item.trim()).filter(Boolean),
          yearsExperience,
          hourlyRateNgn: hourlyRate,
          avatarUrl,
          portfolio: portfolioWithUploads.map((item, index) => ({
            title: item.title.trim() || `Project ${index + 1}`,
            description: item.description.trim(),
            imageUrl: item.imageUrl,
            sortOrder: index,
          })),
        }),
      });
      const payload = await readApiResponse(response);
      if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not save your profile');
      router.replace('/');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your profile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 32 }]}
      bottomOffset={70}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topRow}>
        <View>
          <Text style={styles.brand}>handy<Text style={styles.brandAccent}>skillz</Text></Text>
          <Text style={styles.kicker}>PROFILE SETUP</Text>
        </View>
        <Pressable onPress={() => router.replace('/')}><Text style={styles.skip}>Skip for now</Text></Pressable>
      </View>
      <Text style={styles.title}>Make your profile work for you.</Text>
      <Text style={styles.subtitle}>Tell the right people who you are and what you can get done.</Text>

      <Text style={styles.sectionTitle}>How will you use Handyskillz?</Text>
      <View style={styles.roleGrid}>
        {roleOptions.map((item) => {
          const active = role === item.id;
          return <Pressable key={item.id} onPress={() => setRole(item.id)} style={[styles.roleCard, active && styles.roleCardActive]}>
            <Text style={[styles.roleIcon, active && styles.roleIconActive]}>{item.icon}</Text>
            <Text style={[styles.roleText, active && styles.roleTextActive]}>{item.label}</Text>
          </Pressable>;
        })}
      </View>

      <Text style={styles.sectionTitle}>Your details</Text>
      <View style={styles.form}>
        <Pressable onPress={() => pickImage(setAvatarUri)} style={styles.avatarPicker}>
          {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImage} /> : <Text style={styles.avatarPlus}>+</Text>}
          <View><Text style={styles.avatarTitle}>{avatarUri ? 'Change profile photo' : 'Add a profile photo'}</Text><Text style={styles.avatarHint}>A clear photo helps people trust your profile</Text></View>
        </Pressable>
        <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Full name" placeholderTextColor={muted} style={styles.input} />
        <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone number" placeholderTextColor={muted} style={styles.input} />
        <TextInput value={city} onChangeText={setCity} placeholder="City or service area" placeholderTextColor={muted} style={styles.input} />
        <TextInput value={bio} onChangeText={setBio} multiline placeholder={isProvider ? 'Short professional bio' : 'What do you usually need help with?'} placeholderTextColor={muted} style={[styles.input, styles.textArea]} />
        {isProvider ? <>
          <TextInput value={skillsText} onChangeText={setSkillsText} placeholder="Skills, separated by commas" placeholderTextColor={muted} style={styles.input} />
          <View style={styles.splitRow}>
            <TextInput value={yearsExperience} onChangeText={setYearsExperience} keyboardType="number-pad" placeholder="Years active" placeholderTextColor={muted} style={[styles.input, styles.splitInput]} />
            <TextInput value={hourlyRate} onChangeText={setHourlyRate} keyboardType="number-pad" placeholder="Rate ₦ / hour" placeholderTextColor={muted} style={[styles.input, styles.splitInput]} />
          </View>
        </> : null}
      </View>

      {isProvider ? <View style={styles.portfolioSection}>
        <View style={styles.portfolioHeader}><View><Text style={styles.sectionTitle}>Portfolio</Text><Text style={styles.sectionHint}>Show up to six examples of your best work.</Text></View><Pressable onPress={addPortfolio} style={styles.addButton}><Text style={styles.addButtonText}>+ Add</Text></Pressable></View>
        {portfolio.map((item, index) => <View key={`${index}-${item.uri}`} style={styles.portfolioCard}>
          <Pressable onPress={() => pickImage((uri) => setPortfolio((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, uri } : entry)))} style={styles.portfolioImage}>
            {item.uri ? <Image source={{ uri: item.uri }} style={styles.portfolioImage} /> : <Text style={styles.avatarPlus}>+</Text>}
          </Pressable>
          <View style={styles.portfolioFields}>
            <TextInput value={item.title} onChangeText={(value) => setPortfolio((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, title: value } : entry))} placeholder="Project title" placeholderTextColor={muted} style={styles.portfolioInput} />
            <TextInput value={item.description} onChangeText={(value) => setPortfolio((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, description: value } : entry))} placeholder="What did you deliver?" placeholderTextColor={muted} style={styles.portfolioInput} />
          </View>
        </View>)}
      </View> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable testID="save-profile" onPress={save} disabled={busy} style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>{busy ? 'Saving profile…' : 'Save and enter Handyskillz'}</Text>
      </Pressable>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ink },
  content: { paddingHorizontal: 20, gap: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: text, fontSize: 17, fontFamily: 'Inter_700Bold' },
  brandAccent: { color: lime },
  kicker: { color: lime, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, marginTop: 8 },
  skip: { color: muted, fontSize: 11, fontFamily: 'Inter_500Medium' },
  title: { color: text, fontSize: 28, lineHeight: 34, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, marginTop: 12 },
  subtitle: { color: muted, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  sectionTitle: { color: text, fontSize: 14, fontFamily: 'Inter_700Bold', marginTop: 9 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleCard: { width: '48.5%', minHeight: 74, borderRadius: 16, backgroundColor: panel, padding: 11, justifyContent: 'space-between', borderWidth: 1, borderColor: panel },
  roleCardActive: { backgroundColor: '#303a1e', borderColor: lime },
  roleIcon: { color: lime, fontSize: 20, fontFamily: 'Inter_700Bold' },
  roleIconActive: { color: lime },
  roleText: { color: muted, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_600SemiBold', maxWidth: 130 },
  roleTextActive: { color: text },
  form: { backgroundColor: panel, borderRadius: 20, padding: 13, gap: 9 },
  avatarPicker: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 3 },
  avatarImage: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#30332e' },
  avatarPlus: { color: lime, fontSize: 25, fontFamily: 'Inter_400Regular' },
  avatarTitle: { color: text, fontSize: 12, fontFamily: 'Inter_700Bold' },
  avatarHint: { color: muted, fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular', marginTop: 3 },
  input: { height: 48, borderRadius: 13, backgroundColor: '#2a2c29', color: text, paddingHorizontal: 13, fontSize: 12, fontFamily: 'Inter_400Regular' },
  textArea: { minHeight: 76, paddingTop: 13, textAlignVertical: 'top' },
  splitRow: { flexDirection: 'row', gap: 8 },
  splitInput: { flex: 1 },
  portfolioSection: { gap: 10 },
  portfolioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHint: { color: muted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  addButton: { borderRadius: 16, backgroundColor: lime, paddingHorizontal: 12, paddingVertical: 8 },
  addButtonText: { color: ink, fontSize: 10, fontFamily: 'Inter_700Bold' },
  portfolioCard: { backgroundColor: panel, borderRadius: 17, padding: 10, flexDirection: 'row', gap: 9 },
  portfolioImage: { width: 66, height: 66, borderRadius: 12, backgroundColor: '#30332e', alignItems: 'center', justifyContent: 'center' },
  portfolioFields: { flex: 1, gap: 7 },
  portfolioInput: { height: 29, borderBottomWidth: 1, borderBottomColor: '#3b3e38', color: text, fontSize: 10, fontFamily: 'Inter_400Regular' },
  error: { color: '#ff9b93', fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  primaryButton: { height: 53, borderRadius: 27, backgroundColor: lime, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryButtonText: { color: ink, fontSize: 13, fontFamily: 'Inter_700Bold' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
