import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

const lime = colors.dark.primary;
const ink = colors.dark.background;
const panel = colors.dark.card;
const text = colors.dark.foreground;
const muted = colors.dark.mutedForeground;

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [secondFactor, setSecondFactor] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const finishIfComplete = async () => {
    if (signIn.status !== 'complete') return false;
    await signIn.finalize({ navigate: () => router.replace('/') });
    return true;
  };

  const submit = async () => {
    setMessage('');
    try {
      const result = await signIn.password({ emailAddress: email.trim(), password });
      if (result.error) { setMessage(result.error.message || 'Could not sign in. Check your details.'); return; }
      if (await finishIfComplete()) return;
      if (signIn.status !== 'needs_second_factor' && signIn.status !== 'needs_client_trust') setMessage('Sign in needs another step. Check your account settings or try again.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not sign in. Check your details.'); }
  };

  const selectSecondFactor = async (strategy: string) => {
    setSecondFactor(strategy); setCode(''); setMessage('');
    try {
      const result = strategy === 'email_code' ? await signIn.mfa.sendEmailCode()
        : strategy === 'phone_code' ? await signIn.mfa.sendPhoneCode() : { error: null };
      if (result.error) setMessage(result.error.message || 'Could not send a verification code.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not prepare verification.'); }
  };

  const verifySecondFactor = async () => {
    if (!secondFactor || !code.trim()) return;
    setMessage('');
    try {
      const result = secondFactor === 'email_code' ? await signIn.mfa.verifyEmailCode({ code: code.trim() })
        : secondFactor === 'phone_code' ? await signIn.mfa.verifyPhoneCode({ code: code.trim() })
          : secondFactor === 'totp' ? await signIn.mfa.verifyTOTP({ code: code.trim() })
            : await signIn.mfa.verifyBackupCode({ code: code.trim() });
      if (result.error) { setMessage(result.error.message || 'That verification code is not valid.'); return; }
      if (!(await finishIfComplete())) setMessage('Verification did not finish sign in. Try another available method.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not verify this code.'); }
  };

  const resetSecondFactor = async () => {
    setSecondFactor(null); setCode(''); setMessage(''); await signIn.reset();
  };
  const needsSecondFactor = signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust';
  const availableFactors = (signIn.supportedSecondFactors || []).filter((factor) => ['email_code', 'phone_code', 'totp', 'backup_code'].includes(factor.strategy));
  const strategyLabel: Record<string, string> = { email_code: 'Email code', phone_code: 'Text message code', totp: 'Authenticator app', backup_code: 'Backup code' };

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      bottomOffset={60}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable onPress={() => router.replace('/')}><Text style={styles.back}>‹ Back</Text></Pressable>
      <Text style={styles.brand}>handy<Text style={styles.brandAccent}>skillz</Text></Text>
      <Text style={styles.kicker}>WELCOME BACK</Text>
      <Text style={styles.title}>Sign in to your skill hub.</Text>
      <Text style={styles.subtitle}>Keep your jobs, chats, bids, and payments in one protected place.</Text>
      <View style={styles.form}>
        {needsSecondFactor ? <>
          <Text style={styles.label}>Additional verification</Text>
          {secondFactor ? <>
            <Text style={styles.subtitle}>{secondFactor === 'totp' ? 'Enter the code from your authenticator app.' : secondFactor === 'backup_code' ? 'Enter one of your saved backup codes.' : 'Enter the code sent to your account.'}</Text>
            <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" keyboardType="number-pad" placeholder={secondFactor === 'backup_code' ? 'Backup code' : 'Verification code'} placeholderTextColor={muted} style={styles.input} />
            {message ? <Text style={styles.error}>{message}</Text> : null}
            <Pressable testID="second-factor-submit" onPress={verifySecondFactor} disabled={!code.trim() || fetchStatus === 'fetching'} style={({ pressed }) => [styles.primaryButton, (!code.trim() || fetchStatus === 'fetching') && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{fetchStatus === 'fetching' ? 'Verifying...' : 'Verify and sign in'}</Text>
            </Pressable>
            {(secondFactor === 'email_code' || secondFactor === 'phone_code') ? <Pressable onPress={() => void selectSecondFactor(secondFactor)} disabled={fetchStatus === 'fetching'}><Text style={styles.secondaryAction}>Send a new code</Text></Pressable> : null}
            <Pressable onPress={() => { setSecondFactor(null); setCode(''); setMessage(''); }}><Text style={styles.secondaryAction}>Choose another method</Text></Pressable>
          </> : availableFactors.length ? <>
            <Text style={styles.subtitle}>Choose a verification method for {email.trim()}.</Text>
            {availableFactors.filter((factor, index, all) => all.findIndex((candidate) => candidate.strategy === factor.strategy) === index).map((factor) => <Pressable key={factor.strategy} testID={`second-factor-${factor.strategy}`} onPress={() => void selectSecondFactor(factor.strategy)} disabled={fetchStatus === 'fetching'} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{strategyLabel[factor.strategy] || factor.strategy}</Text>
            </Pressable>)}
            {message ? <Text style={styles.error}>{message}</Text> : null}
          </> : <Text style={styles.error}>No supported second factor is available. Contact the account administrator to restore access.</Text>}
          <Pressable onPress={() => void resetSecondFactor()}><Text style={styles.secondaryAction}>Back to sign in</Text></Pressable>
        </> : <>
          <Text style={styles.label}>Email address</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={muted} style={styles.input} />
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordField}>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete="current-password" placeholder="Enter your password" placeholderTextColor={muted} style={[styles.input, styles.passwordInput]} />
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((visible) => !visible)} style={styles.passwordToggle} hitSlop={10}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={muted} />
            </Pressable>
          </View>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          {errors?.fields?.identifier?.message ? <Text style={styles.error}>{errors.fields.identifier.message}</Text> : null}
          <Pressable testID="sign-in-submit" onPress={submit} disabled={!email || !password || fetchStatus === 'fetching'} style={({ pressed }) => [styles.primaryButton, (!email || !password || fetchStatus === 'fetching') && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{fetchStatus === 'fetching' ? 'Signing in...' : 'Sign in'}</Text>
          </Pressable>
        </>}
      </View>
      <Text style={styles.footerText}>New to Handyskillz? <Link href="/(auth)/sign-up" style={styles.link}>Create an account</Link></Text>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ink },
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 14 },
  back: { color: muted, fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 18 },
  brand: { color: text, fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  brandAccent: { color: lime },
  kicker: { color: lime, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.6, marginTop: 30 },
  title: { color: text, fontSize: 31, lineHeight: 37, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  subtitle: { color: muted, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', maxWidth: 330 },
  form: { backgroundColor: panel, borderRadius: 22, padding: 16, marginTop: 18, gap: 9 },
  label: { color: text, fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  input: { height: 50, borderRadius: 14, backgroundColor: '#2a2c29', color: text, paddingHorizontal: 14, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  passwordField: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 48 },
  passwordToggle: { position: 'absolute', right: 13, top: 0, height: 50, width: 30, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#ff9b93', fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  primaryButton: { height: 52, borderRadius: 26, backgroundColor: lime, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryButtonText: { color: ink, fontSize: 13, fontFamily: 'Inter_700Bold' },
  secondaryAction: { color: lime, textAlign: 'center', fontSize: 12, fontFamily: 'Inter_600SemiBold', paddingVertical: 10 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  footerText: { color: muted, fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 14 },
  link: { color: lime, fontFamily: 'Inter_700Bold' },
});
