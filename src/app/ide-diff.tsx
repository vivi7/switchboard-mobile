import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lineDiff } from '@/git/history';
import type { DiffLine } from '@/git/model';
import { request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
const LINE_STYLES: Record<DiffLine['kind'], object> = {
  meta: { color: colors.textFaint },
  hunk: { color: colors.accent },
  add: { color: '#8fd19e', backgroundColor: 'rgba(76,175,143,0.12)' },
  del: { color: '#f19aa1', backgroundColor: 'rgba(224,108,117,0.12)' },
  context: { color: colors.text },
};

/**
 * A change Claude wants to make to a file, from a session started on the
 * desktop with IDE emulation: accept it or reject it. The first answer wins,
 * here, on another phone or in the window.
 */
export default function IdeDiffScreen() {
  const { diffId } = useLocalSearchParams<{ diffId: string }>();
  const insets = useSafeAreaInsets();
  const diff = useConnection((s) => s.diffs[diffId]);
  const [answering, setAnswering] = useState(false);
  const lines = useMemo(() => (diff ? lineDiff(diff.oldContent || '', diff.newContent || '') : []), [diff]);
  const name = diff ? diff.oldFilePath.split('/').pop() : 'Change';

  const answer = async (action: 'accept' | 'reject') => {
    if (!diff) return;
    setAnswering(true);
    try {
      const result = await request<{ ok: boolean }>('mcp-diff-response', [diff.sessionId, diff.diffId, action]);
      if (!result?.ok) Alert.alert('Already answered', 'Someone answered this change first.');
      router.back();
    } catch (err: any) {
      Alert.alert('Could not answer', err.message);
    } finally {
      setAnswering(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: name }} />
      {!diff ? (
        <Text style={styles.empty}>This change was answered or withdrawn.</Text>
      ) : (
        <>
          <Text style={styles.path} numberOfLines={2}>{diff.oldFilePath}</Text>
          <ScrollView style={styles.body}>
            <ScrollView horizontal contentContainerStyle={styles.content}>
              <View>
                {lines.length ? lines.map((line, i) => <Text key={i} style={[styles.line, LINE_STYLES[line.kind]]}>{line.text || ' '}</Text>)
                  : <Text style={styles.line}>No differences.</Text>}
              </View>
            </ScrollView>
          </ScrollView>
          <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>
            <Pressable onPress={() => answer('reject')} disabled={answering} style={[styles.button, styles.reject]} accessibilityRole="button">
              <Text style={styles.buttonText}>Reject</Text>
            </Pressable>
            <Pressable onPress={() => answer('accept')} disabled={answering} style={[styles.button, styles.accept]} accessibilityRole="button">
              <Text style={styles.buttonText}>Accept</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  empty: { color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  path: { color: colors.textDim, fontSize: 12, fontFamily: mono, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  body: { flex: 1 },
  content: { paddingBottom: spacing.md },
  line: { fontFamily: mono, fontSize: 12, lineHeight: 17, paddingHorizontal: spacing.md, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  button: { flex: 1, borderRadius: 10, paddingVertical: spacing.md, alignItems: 'center' },
  reject: { backgroundColor: 'rgba(224,108,117,0.25)' },
  accept: { backgroundColor: colors.running },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
