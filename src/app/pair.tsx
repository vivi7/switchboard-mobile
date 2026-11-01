import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { parsePairingLink, type PairingPayload } from '@/remote/pairing';
import { useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

const DEFAULT_NAME = Platform.OS === 'ios' ? 'iPhone' : 'Android phone';

function readLink(text: string): { payload: PairingPayload | null; error: string } {
  try {
    return { payload: parsePairingLink(text), error: '' };
  } catch (err: any) {
    return { payload: null, error: err.message };
  }
}

/**
 * Pair with Switchboard on a computer: scan the QR code from its Mobile app
 * access dialog (or paste the link), then confirm. A switchboard://pair link
 * opened from outside lands here too.
 */
export default function PairScreen() {
  const params = useLocalSearchParams<{ d?: string }>();
  const pair = useConnection((s) => s.pair);
  const [permission, requestPermission] = useCameraPermissions();
  const [payload, setPayload] = useState<PairingPayload | null>(null);
  const [error, setError] = useState('');
  // A link opened from outside the app arrives as the d parameter, also
  // while this screen is already open; read each new one once.
  const [linkSeen, setLinkSeen] = useState<string | undefined>(undefined);
  if (params.d && params.d !== linkSeen) {
    setLinkSeen(params.d);
    const result = readLink(`switchboard://pair?d=${params.d}`);
    setPayload(result.payload);
    setError(result.error);
  }
  const [pasted, setPasted] = useState('');
  const [name, setName] = useState(DEFAULT_NAME);
  const [pairing, setPairing] = useState(false);

  const read = (text: string) => {
    const result = readLink(text);
    setPayload(result.payload);
    setError(result.error);
  };

  const confirm = async () => {
    if (!payload) return;
    setPairing(true);
    setError('');
    try {
      await pair(payload, name.trim() || DEFAULT_NAME);
      router.replace('/');
    } catch (err: any) {
      setError(err.message);
      setPayload(null);
    } finally {
      setPairing(false);
    }
  };

  if (payload) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>Pair with {payload.desktopName}?</Text>
        <Text style={styles.text}>This phone will be able to see and drive Switchboard on that computer while its Mobile app access switch is on.</Text>
        <Text style={styles.label}>Name of this phone</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.textFaint} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={confirm} disabled={pairing} style={[styles.primary, pairing && { opacity: 0.6 }]} accessibilityRole="button">
          {pairing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Pair</Text>}
        </Pressable>
        <Pressable onPress={() => setPayload(null)} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Scan another code</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screenScroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.text}>
        On the computer, turn on the Mobile app access switch in Switchboard&apos;s sidebar. Its pairing code appears on its own the first time; later, right-click the switch and choose Pair a phone.
      </Text>
      {permission?.granted ? (
        <View style={styles.cameraFrame}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => { if (!payload) read(data); }}
          />
        </View>
      ) : (
        <Pressable onPress={requestPermission} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>Scan the pairing code</Text>
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>Or paste the pairing link</Text>
      <TextInput
        value={pasted}
        onChangeText={setPasted}
        placeholder="switchboard://pair?d=…"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        onSubmitEditing={() => read(pasted)}
      />
      <Pressable onPress={() => read(pasted)} disabled={!pasted.trim()} style={[styles.secondary, !pasted.trim() && { opacity: 0.4 }]} accessibilityRole="button">
        <Text style={styles.secondaryText}>Use this link</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  screenScroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  heading: { color: colors.text, fontSize: 20, fontWeight: '600' },
  text: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginTop: spacing.sm },
  input: {
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
  },
  cameraFrame: { height: 300, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  primary: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: { paddingVertical: 11, alignItems: 'center' },
  secondaryText: { color: colors.accent, fontSize: 15 },
  error: { color: colors.danger, fontSize: 14 },
});
