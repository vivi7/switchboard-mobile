import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { statusLetter, type Change } from '@/git/model';
import { request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type FileChange = { path: string; oldPath: string | null; status: Change['status']; insertions: number; deletions: number };
type Detail = {
  ok?: boolean; error?: string;
  commit: { hash: string; shortHash: string; parents: string[]; authorName: string; authorEmail: string; authorDate: string; subject: string; body: string };
  files: FileChange[];
};

/** One commit of the Git Graph: its message, author and files, each with its diff. */
export default function CommitScreen() {
  const { projectId, folder, hash } = useLocalSearchParams<{ projectId: string; folder: string; hash: string }>();
  const online = useConnection((s) => s.status.state === 'online');
  const detail = useQuery({
    queryKey: ['git-commit', projectId, folder, hash],
    queryFn: () => request<Detail>('get-git-graph-commit-detail', [projectId, folder, hash]),
    enabled: online && !!hash,
  });
  const data = detail.data;
  const commit = data?.commit;
  // A root commit has nothing to compare with.
  const parent = commit?.parents[0];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: commit?.shortHash || 'Commit' }} />
      {detail.isLoading ? <ActivityIndicator style={{ margin: spacing.xl }} color={colors.accent} /> : null}
      {data?.error ? <Text style={styles.empty}>{data.error}</Text> : null}
      {commit ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subject} selectable>{commit.subject}</Text>
          {commit.body ? <Text style={styles.body} selectable>{commit.body.trim()}</Text> : null}
          <Text style={styles.meta} selectable>{commit.authorName} &lt;{commit.authorEmail}&gt;</Text>
          <Text style={styles.meta}>{new Date(commit.authorDate).toLocaleString()}</Text>
          <Text style={styles.meta} selectable>{commit.hash}</Text>
          {commit.parents.length > 1 ? <Text style={styles.meta}>Merge of {commit.parents.map((p) => p.slice(0, 7)).join(' and ')}, compared with the first</Text> : null}
          <Text style={styles.heading}>{data.files.length} file{data.files.length === 1 ? '' : 's'} changed</Text>
          {data.files.map((file) => (
            <Pressable
              key={file.path}
              disabled={!parent}
              onPress={() => router.push({ pathname: '/diff', params: { projectId, folder, path: file.path, from: parent!, to: commit.hash } })}
              style={({ pressed }) => [styles.file, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.letter}>{statusLetter({ path: file.path, status: file.status, staged: false })}</Text>
              <Text style={styles.path} numberOfLines={2}>{file.oldPath && file.oldPath !== file.path ? `${file.oldPath} → ${file.path}` : file.path}</Text>
              <Text style={styles.stats}><Text style={styles.add}>+{file.insertions}</Text> <Text style={styles.del}>−{file.deletions}</Text></Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: 4 },
  empty: { color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  subject: { color: colors.text, fontSize: 17, fontWeight: '600' },
  body: { color: colors.textDim, fontSize: 14, lineHeight: 20, marginVertical: spacing.sm },
  meta: { color: colors.textFaint, fontSize: 12 },
  heading: { color: colors.textDim, fontSize: 13, fontWeight: '600', marginTop: spacing.lg, marginBottom: spacing.xs },
  file: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  pressed: { backgroundColor: colors.surface },
  letter: { width: 14, color: colors.attention, fontFamily: 'Menlo', fontWeight: '700' },
  path: { flex: 1, color: colors.text, fontSize: 14 },
  stats: { fontSize: 12, fontFamily: 'Menlo' },
  add: { color: colors.running },
  del: { color: colors.danger },
});
