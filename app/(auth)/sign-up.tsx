import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSignUp } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

const lime = colors.dark.primary;
const ink = colors.dark.background;
const panel = colors.dark.card;
const text = colors.dark.foreground;
const muted = colors.dark.mutedForeground;

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const readableError = (error: unknown, fallback: string) => {
    const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    if (/failed to fetch|network error|err_ssl|ssl_bad_record|connection.*(?:reset|refused|timed out)/i.test(detail)) {
      return 'Cannot connect securely to Clerk. Check your internet connection and turn off any VPN, proxy, or HTTPS scanning, then try again.';
    }
    return detail || fallback;
  };

  const start = async () => {
    setMessage('');
    try {
      const result = await signUp.password({ emailAddress: email.trim(), password });
      if (result.error) { setMessage(readableError(result.error, 'Could not create your account.')); return; }
      const verification = await signUp.verifications.sendEmailCode();
      if (verification.error) setMessage(readableError(verification.error, 'Could not send the verification code.'));
    } catch (error) {
      setMessage(readableError(error, 'Could not create your account.'));
    }
  };

  const verify = async () => {
    setMessage('');
    try {
      const result = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (result.error) { setMessage(readableError(result.error, 'That verification code is not valid.')); return; }
      if (signUp.status === 'complete') {
        const finalized = await signUp.finalize({ navigate: () => router.replace('/profile-setup') });
        if (finalized.error) setMessage(readableError(finalized.error, 'Could not finish creating your account.'));
      }
    } catch (error) {
      setMessage(readableError(error, 'That verification code is not valid.'));
    }
  };

  const resendCode = async () => {
    setMessage('');
    try {
      const result = await signUp.verifications.sendEmailCode();
      if (result.error) setMessage(readableError(result.error, 'Could not send the verification code.'));
    } catch (error) { setMessage(readableError(error, 'Could not send the verification code.')); }
  };

  const clerkEmailError = errors?.fields?.emailAddress?.message;
  const emailErrorText = clerkEmailError ? readableError(clerkEmailError, '') : '';

  const verifying = signUp.status === 'missing_requirements' && signUp.unverifiedFields.includes('email_address') && signUp.missingFields.length === 0;
  return (
    <KeyboardAwareScrollViewCompat
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      bottomOffset={60}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable onPress={() => router.replace('/')}><Text style={styles.back}>‹ Back</Text></Pressable>
      <Text style={styles.brand}>handy<Text style={styles.brandAccent}>skillz</Text></Text>
      <Text style={styles.kicker}>{verifying ? 'VERIFY YOUR EMAIL' : 'CREATE YOUR ACCOUNT'}</Text>
      <Text style={styles.title}>{verifying ? 'One last step.' : 'Build your local skill network.'}</Text>
      <Text style={styles.subtitle}>{verifying ? `We sent a code to ${email}.` : 'Find trusted experts, win better work, and keep payments protected.'}</Text>
      <View style={styles.form}>
        {verifying ? (
          <>
            <Text style={styles.label}>Verification code</Text>
            <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="Enter the 6-digit code" placeholderTextColor={muted} style={styles.input} />
            <Pressable testID="verify-submit" onPress={verify} disabled={!code || fetchStatus === 'fetching'} style={({ pressed }) => [styles.primaryButton, !code && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{fetchStatus === 'fetching' ? 'Verifying…' : 'Verify and continue'}</Text>
            </Pressable>
            <Pressable disabled={fetchStatus === 'fetching'} onPress={() => void resendCode()}><Text style={styles.secondaryAction}>Send a new code</Text></Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>Email address</Text>
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={muted} style={styles.input} />
            <Text style={styles.label}>Password</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" placeholderTextColor={muted} style={styles.input} />
            <View nativeID="clerk-captcha" />
            <Pressable testID="sign-up-submit" onPress={start} disabled={!email || !password || fetchStatus === 'fetching'} style={({ pressed }) => [styles.primaryButton, (!email || !password) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{fetchStatus === 'fetching' ? 'Creating…' : 'Create account'}</Text>
            </Pressable>
          </>
        )}
        {message ? <Text style={styles.error}>{message}</Text> : null}
        {!message && emailErrorText ? <Text style={styles.error}>{emailErrorText}</Text> : null}
      </View>
      <Text style={styles.footerText}>Already have an account? <Link href="/(auth)/sign-in" style={styles.link}>Sign in</Link></Text>
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
  primaryButton: { height: 52, borderRadius: 26, backgroundColor: lime, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryButtonText: { color: ink, fontSize: 13, fontFamily: 'Inter_700Bold' },
  secondaryAction: { color: lime, textAlign: 'center', fontSize: 12, fontFamily: 'Inter_600SemiBold', paddingVertical: 10 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  error: { color: '#ff9b93', fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  footerText: { color: muted, fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 14 },
  link: { color: lime, fontFamily: 'Inter_700Bold' },
});
