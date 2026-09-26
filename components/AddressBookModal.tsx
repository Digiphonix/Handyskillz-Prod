import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Address = {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  country: string;
  is_default: boolean;
};
type AddressDraft = {
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};
type TextDraftKey = Exclude<keyof AddressDraft, 'isDefault'>;

const emptyDraft: AddressDraft = {
  label: 'Home', recipientName: '', phone: '', addressLine1: '', addressLine2: '',
  city: '', state: '', postalCode: '', country: 'Nigeria', isDefault: false,
};

export default function AddressBookModal({ visible, onClose, getToken, palette }: {
  visible: boolean;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  palette: Palette;
}) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [draft, setDraft] = useState<AddressDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';

  const request = async (path: string, init?: RequestInit) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to use saved addresses.');
    const token = await getToken();
    if (!token) throw new Error('Your session has expired. Sign in again to manage addresses.');
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}/api${path}`, { ...init, headers });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error(`Address service returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Address request failed.');
    return payload;
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await request('/addresses');
      setAddresses(Array.isArray(payload.addresses) ? payload.addresses : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load addresses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) void load();
  }, [visible]);

  const beginAdd = () => {
    setEditingId(null);
    setDraft({ ...emptyDraft, isDefault: addresses.length === 0 });
    setError('');
    setFormOpen(true);
  };

  const beginEdit = (address: Address) => {
    setEditingId(address.id);
    setDraft({
      label: address.label,
      recipientName: address.recipient_name,
      phone: address.phone,
      addressLine1: address.address_line_1,
      addressLine2: address.address_line_2 || '',
      city: address.city,
      state: address.state,
      postalCode: address.postal_code || '',
      country: address.country,
      isDefault: address.is_default,
    });
    setError('');
    setFormOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await request(editingId ? `/addresses/${encodeURIComponent(editingId)}` : '/addresses', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(draft),
      });
      setFormOpen(false);
      setDraft(emptyDraft);
      setEditingId(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this address.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError('');
    try {
      await request(`/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not delete this address.');
    }
  };

  const makeDefault = async (address: Address) => {
    setSaving(true);
    setError('');
    try {
      await request(`/addresses/${encodeURIComponent(address.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          label: address.label, recipientName: address.recipient_name, phone: address.phone,
          addressLine1: address.address_line_1, addressLine2: address.address_line_2 || '',
          city: address.city, state: address.state, postalCode: address.postal_code || '',
          country: address.country, isDefault: true,
        }),
      });
      await load();
    } catch (defaultError) {
      setError(defaultError instanceof Error ? defaultError.message : 'Could not update the default address.');
    } finally {
      setSaving(false);
    }
  };

  const field = (key: TextDraftKey, label: string, optional = false) => (
    <TextInput
      value={draft[key] as string}
      onChangeText={(value) => setDraft((current) => ({ ...current, [key]: value }))}
      placeholder={`${label}${optional ? ' (optional)' : ''}`}
      placeholderTextColor={palette.mutedForeground}
      style={[styles.input, { color: palette.foreground, backgroundColor: palette.background, borderColor: palette.border }]}
      accessibilityLabel={label}
    />
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.card }]}>
          <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
          <View style={styles.header}>
            <View><Text style={[styles.title, { color: palette.foreground }]}>My Addresses</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Manage your service and delivery locations.</Text></View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close addresses"><Feather name="x" size={22} color={palette.foreground} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {loading ? <ActivityIndicator color={palette.tint} /> : null}
            {!loading && addresses.length === 0 && !formOpen ? <Text style={[styles.empty, { color: palette.mutedForeground }]}>No saved addresses yet. Add one to make future bookings quicker.</Text> : null}
            {addresses.map((address) => (
              <View key={address.id} style={[styles.addressCard, { backgroundColor: palette.background, borderColor: palette.border }]}>
                <View style={styles.addressTop}>
                  <Text style={[styles.addressLabel, { color: palette.foreground }]}>{address.label}</Text>
                  {address.is_default ? <Text style={[styles.defaultBadge, { color: palette.primaryForeground, backgroundColor: palette.primary }]}>DEFAULT</Text> : null}
                </View>
                <Text style={[styles.addressText, { color: palette.mutedForeground }]}>{address.recipient_name} · {address.phone}{'\n'}{address.address_line_1}{address.address_line_2 ? `, ${address.address_line_2}` : ''}{'\n'}{address.city}, {address.state}{address.postal_code ? ` ${address.postal_code}` : ''}, {address.country}</Text>
                <View style={styles.rowActions}>
                  <Pressable onPress={() => beginEdit(address)}><Text style={[styles.action, { color: palette.tint }]}>Edit</Text></Pressable>
                  {!address.is_default ? <Pressable onPress={() => void makeDefault(address)} disabled={saving}><Text style={[styles.action, { color: palette.tint }]}>Make default</Text></Pressable> : null}
                  <Pressable onPress={() => void remove(address.id)}><Text style={[styles.action, { color: palette.destructive }]}>Remove</Text></Pressable>
                </View>
              </View>
            ))}
            {formOpen ? <View style={[styles.form, { backgroundColor: palette.background }]}>
              <Text style={[styles.formTitle, { color: palette.foreground }]}>{editingId ? 'Edit address' : 'Add an address'}</Text>
              {field('label', 'Label (Home, Work, etc.)')}
              {field('recipientName', 'Recipient name')}
              {field('phone', 'Phone number')}
              {field('addressLine1', 'Street address')}
              {field('addressLine2', 'Apartment, suite, landmark', true)}
              <View style={styles.split}>{field('city', 'City')}{field('state', 'State')}</View>
              <View style={styles.split}>{field('postalCode', 'Postal code', true)}{field('country', 'Country')}</View>
              <Pressable onPress={() => setDraft((current) => ({ ...current, isDefault: !current.isDefault }))} style={styles.defaultToggle}>
                <Feather name={draft.isDefault ? 'check-square' : 'square'} size={18} color={palette.tint} />
                <Text style={[styles.toggleLabel, { color: palette.foreground }]}>Set as default address</Text>
              </Pressable>
              <View style={styles.split}>
                <Pressable onPress={() => { setFormOpen(false); setError(''); }} style={[styles.secondaryButton, { borderColor: palette.border }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>Cancel</Text></Pressable>
                <Pressable onPress={() => void save()} disabled={saving} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{saving ? 'Saving…' : 'Save address'}</Text></Pressable>
              </View>
            </View> : <Pressable onPress={beginAdd} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>+ Add address</Text></Pressable>}
            {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '88%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, lineHeight: 18, marginTop: 4, fontFamily: 'Inter_400Regular' },
  content: { gap: 12, paddingBottom: 12 },
  empty: { fontSize: 13, lineHeight: 20, paddingVertical: 16, fontFamily: 'Inter_400Regular' },
  addressCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  addressTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addressLabel: { fontSize: 14, fontFamily: 'Inter_700Bold', flex: 1 },
  defaultBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden', fontSize: 8, fontFamily: 'Inter_700Bold' },
  addressText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  rowActions: { flexDirection: 'row', gap: 18, marginTop: 3 },
  action: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  form: { borderRadius: 16, padding: 13, gap: 9 },
  formTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  input: { minWidth: 0, flex: 1, minHeight: 43, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, fontSize: 12, fontFamily: 'Inter_400Regular' },
  split: { flexDirection: 'row', gap: 8 },
  defaultToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  toggleLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  primaryButton: { minHeight: 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, flex: 1 },
  secondaryButton: { minHeight: 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, flex: 1 },
  buttonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});
