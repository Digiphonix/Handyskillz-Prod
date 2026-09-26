import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.dark;
type Bank = { name: string; code: string };
type PayoutAccount = { bank_name: string; account_name: string; account_last4: string };

export default function PayoutSettingsModal({ visible, onClose, getToken, palette }: {
  visible: boolean; onClose: () => void; getToken: () => Promise<string | null>; palette: Palette;
}) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [bankSearch, setBankSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';

  const request = async (path: string, init?: RequestInit) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to manage payout details.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to manage payout details.');
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init?.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}/api${path}`, { ...init, headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Payout request failed.');
    return payload;
  };

  const load = async () => {
    setBusy(true); setError('');
    try {
      const [bankResult, payoutResult] = await Promise.allSettled([request('/payments/paystack/banks'), request('/payouts/me')]);
      if (payoutResult.status === 'rejected') throw payoutResult.reason;
      setAccount(payoutResult.value.payoutAccount || null);
      if (bankResult.status === 'fulfilled') setBanks(Array.isArray(bankResult.value.banks) ? bankResult.value.banks : []);
      else setError(bankResult.reason instanceof Error ? bankResult.reason.message : 'Could not load Paystack banks.');
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load payout settings.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (visible) void load(); }, [visible]);

  const save = async () => {
    if (!accountName.trim() || !selectedBank || accountNumber.replace(/\D/g, '').length !== 10) {
      setError('Enter the account holder name, choose a bank and enter a 10-digit account number.'); return;
    }
    setBusy(true); setError('');
    try {
      const payload = await request('/payouts/me', { method: 'PUT', body: JSON.stringify({ accountName, accountNumber, bankCode: selectedBank.code }) });
      setAccount(payload.payoutAccount); setAccountNumber('');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save payout account.'); }
    finally { setBusy(false); }
  };
  const filteredBanks = banks.filter((bank) => bank.name.toLowerCase().includes(bankSearch.toLowerCase())).slice(0, 8);
  const inputStyle = [styles.input, { color: palette.foreground, backgroundColor: palette.background, borderColor: palette.border }];

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card }]}>
      <View style={[styles.handle, { backgroundColor: palette.mutedForeground }]} />
      <Text style={[styles.title, { color: palette.foreground }]}>Payout settings</Text>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Add a bank account with Paystack. The account number is sent securely to Paystack and only its last four digits are saved here.</Text>
      {account ? <View style={[styles.savedCard, { backgroundColor: palette.background, borderColor: palette.border }]}><Text style={[styles.savedTitle, { color: palette.foreground }]}>{account.bank_name}</Text><Text style={[styles.subtitle, { color: palette.mutedForeground }]}>{account.account_name} ·•••• {account.account_last4}</Text></View> : null}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
        <TextInput value={accountName} onChangeText={setAccountName} placeholder="Account holder name" placeholderTextColor={palette.mutedForeground} style={inputStyle} />
        <TextInput value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" maxLength={10} placeholder="10-digit account number" placeholderTextColor={palette.mutedForeground} style={inputStyle} />
        <TextInput value={selectedBank?.name || bankSearch} onChangeText={(value) => { setBankSearch(value); setSelectedBank(null); }} placeholder="Search your bank" placeholderTextColor={palette.mutedForeground} style={inputStyle} />
        {!selectedBank ? filteredBanks.map((bank) => <Pressable key={bank.code} onPress={() => { setSelectedBank(bank); setBankSearch(bank.name); }} style={[styles.bankItem, { borderColor: palette.border }]}><Text style={[styles.bankName, { color: palette.foreground }]}>{bank.name}</Text></Pressable>) : null}
        {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable onPress={onClose} style={[styles.button, { borderColor: palette.border, borderWidth: 1 }]}><Text style={[styles.buttonText, { color: palette.foreground }]}>Done</Text></Pressable>
          <Pressable onPress={() => void save()} disabled={busy} style={[styles.button, { backgroundColor: palette.primary }]}><Text style={[styles.buttonText, { color: palette.primaryForeground }]}>{busy ? 'Working…' : 'Save bank account'}</Text></Pressable>
        </View>
        {busy && banks.length === 0 ? <ActivityIndicator color={palette.tint} /> : null}
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17, opacity: 0.55 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, lineHeight: 18, marginTop: 4, fontFamily: 'Inter_400Regular' },
  savedCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  savedTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  fields: { gap: 8, paddingTop: 14, paddingBottom: 8 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 12, fontFamily: 'Inter_400Regular' },
  bankItem: { borderBottomWidth: 1, padding: 10 },
  bankName: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  error: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  actions: { flexDirection: 'row', gap: 9, marginTop: 6 },
  button: { flex: 1, minHeight: 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});
