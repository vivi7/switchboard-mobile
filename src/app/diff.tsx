import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { lineDiff } from '@/git/history';
import { diffLines, type DiffLine } from '@/git/model';
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
 * One file's diff: a changed file against HEAD (get-project-git-diff), or a
 * file between two revisions of the Git Graph (from, to).
 */
export default function DiffScreen() {
  const { projectId, folder, path, from, to } = useLocalSearchParams<{ projectId: string; folder: string; path: string; from?: string; to?: string }>();
  const online = useConnection((s) => s.status.state === 'online');
  const result = useQuery({
    queryKey: ['diff', projectId, folder, path, from, to],
    queryFn: () => from
      // The Git Graph sends both versions; the diff is worked out here.
      ? request<{ oldContent?: string; newContent?: string; error?: string }>('get-git-graph-file-diff-between', [projectId, folder, from, to || null, path])
      : request<{ diff?: string; truncated?: boolean; error?: string }>('get-project-git-diff', [projectId, folder, path]),
    enabled: online && !!projectId && !!folder && !!path,
    refetchOnMount: 'always',
  });
  const lines = useMemo(() => {
    const data: any = result.data;
    if (!data || data.error) return [];
    return from ? lineDiff(data.oldContent || '', data.newContent || '') : diffLines(data.diff || '');
  }, [result.data, from]);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: (path || '').split('/').pop() || 'Diff' }} />
      {result.isLoading ? <ActivityIndicator style={{ margin: spacing.xl }} color={colors.accent} /> : null}
      {result.data?.error ? <Text style={styles.empty}>{result.data.error}</Text> : null}
      {!result.isLoading && !result.data?.error && !lines.length ? <Text style={styles.empty}>No differences.</Text> : null}
      <ScrollView>
        <ScrollView horizontal contentContainerStyle={styles.content}>
          <View>
            {lines.map((line, i) => <Text key={i} style={[styles.line, LINE_STYLES[line.kind]]}>{line.text || ' '}</Text>)}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingVertical: spacing.md },
  line: { fontFamily: mono, fontSize: 12, lineHeight: 17, paddingHorizontal: spacing.md },
  empty: { color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
