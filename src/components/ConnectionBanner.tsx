import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

/** What the connection to the computer is doing, when it is not simply online. */
export function ConnectionBanner() {
  const status = useConnection((s) => s.status);
  const reconnect = useConnection((s) => s.reconnect);

  if (status.state === 'online' || status.state === 'closed') return null;
  if (status.state === 'connecting') {
    return (
      <View style={styles.banner}>
        <Text style={styles.text}>Connecting to the computer…</Text>
      </View>
    );
  }
  if (status.state === 'offline') {
    return (
      <View style={styles.banner}>
        <Text style={styles.text}>{status.error}</Text>
        <Pressable onPress={reconnect} hitSlop={8}>
          <Text style={styles.action}>Retry now</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[styles.banner, styles.rejected]}>
      <Text style={styles.text}>{status.message}</Text>
      <Pressable onPress={() => router.push('/pair')} hitSlop={8}>
        <Text style={styles.action}>Pair again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.raised,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rejected: { backgroundColor: 'rgba(224,108,117,0.15)' },
  text: { flex: 1, color: colors.textDim, fontSize: 13 },
  action: { color: colors.accent, fontSize: 13, fontWeight: '600' },
});
