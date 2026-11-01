import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

function describe(status: ReturnType<typeof useConnection.getState>['status']): string {
  switch (status.state) {
    case 'online': return `Connected through ${status.address}`;
    case 'connecting': return 'Connecting…';
    case 'offline': return status.error;
    case 'rejected': return status.message;
    default: return 'Not connected';
  }
}

/** The paired computer: how it is reached, and forgetting it. */
export default function SettingsScreen() {
  const desktop = useConnection((s) => s.desktop);
  const status = useConnection((s) => s.status);
  const reconnect = useConnection((s) => s.reconnect);
  const forget = useConnection((s) => s.forget);

  if (!desktop) return null;
  const hello = status.state === 'online' ? status.hello : null;

  const confirmForget = () => Alert.alert(
    `Forget ${desktop.name}?`,
    'This phone deletes its key for that computer. To be sure it can never connect again, also remove it in Switchboard on the computer (right-click the Mobile app access switch, then Phones and port).',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Forget', style: 'destructive', onPress: async () => { await forget(); router.replace('/pair'); } },
    ],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Row label="Computer" value={desktop.name} />
      <Row label="Status" value={describe(status)} />
      {hello ? <Row label="Switchboard" value={`version ${hello.appVersion}`} /> : null}
      {hello ? <Row label="This phone on the computer" value={hello.device.name} /> : null}
      <Row label="Addresses" value={`${desktop.addresses.join(', ')} (port ${desktop.port})`} />
      <Row label="Paired" value={new Date(desktop.pairedAt).toLocaleString()} />
      {status.state === 'offline' ? (
        <Pressable onPress={reconnect} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Reconnect now</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => router.push('/usage')} style={styles.button} accessibilityRole="button">
        <Text style={styles.buttonText}>Usage and limits</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/pair')} style={styles.button} accessibilityRole="button">
        <Text style={styles.buttonText}>Pair again</Text>
      </Pressable>
      <Pressable onPress={confirmForget} style={styles.button} accessibilityRole="button">
        <Text style={[styles.buttonText, { color: colors.danger }]}>Forget this computer</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  row: { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md, gap: 3 },
  label: { color: colors.textFaint, fontSize: 12 },
  value: { color: colors.text, fontSize: 15 },
  button: { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  buttonText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
