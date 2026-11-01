import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { changeRows, statusLetter, type Change, type Repository } from '@/git/model';
import { relativeTime, shortProjectPath } from '@/sessions/model';
import { request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

const STATUS_COLORS: Record<Change['status'], string> = {
  modified: colors.attention, added: colors.running, untracked: colors.running, deleted: colors.danger, renamed: colors.accent, conflicted: colors.danger,
};

/** A project's repositories: branch, what changed (as a list or a tree) and the latest commits. */
export default function GitScreen() {
  const { projectId, title } = useLocalSearchParams<{ projectId: string; title?: string }>();
  const online = useConnection((s) => s.status.state === 'online');
  const [tree, setTree] = useState(false);
  const info = useQuery({
    queryKey: ['git-info', projectId],
    queryFn: () => request<{ ok?: boolean; repositories?: Repository[]; error?: string }>('get-project-git-info', [projectId]),
    enabled: online && !!projectId,
    // No event says a working tree changed: read it again each time.
    refetchOnMount: 'always',
  });
  const repositories = info.data?.repositories || [];

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: title ? `${title} · Git` : 'Git',
          headerRight: () => (
            <Pressable onPress={() => setTree((t) => !t)} hitSlop={10} accessibilityRole="button">
              <Text style={styles.headerButton}>{tree ? 'List' : 'Tree'}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView refreshControl={<RefreshControl refreshing={info.isRefetching} onRefresh={() => { info.refetch(); }} tintColor={colors.accent} />}>
        {info.isLoading ? <ActivityIndicator style={{ margin: spacing.xl }} color={colors.accent} /> : null}
        {info.data?.error ? <Text style={styles.empty}>{info.data.error}</Text> : null}
        {!info.isLoading && !repositories.length ? <Text style={styles.empty}>No folder of this project is attached yet.</Text> : null}
        {repositories.map((repo) => <RepositoryBlock key={repo.path} projectId={projectId} repo={repo} tree={tree} />)}
      </ScrollView>
    </View>
  );
}

function RepositoryBlock({ projectId, repo, tree }: { projectId: string; repo: Repository; tree: boolean }) {
  const changes = repo.changes || [];
  const sync = [repo.ahead ? `↑${repo.ahead}` : null, repo.behind ? `↓${repo.behind}` : null].filter(Boolean).join(' ');
  const rows = tree ? changeRows(changes) : changes.map((change) => ({ key: change.path, depth: 0, name: change.path, change }));
  return (
    <View style={styles.repo}>
      <Text style={styles.repoName}>{shortProjectPath(repo.path)}</Text>
      {!repo.git ? <Text style={styles.meta}>Not a git repository.</Text> : (
        <>
          <Text style={styles.meta}>
            {[repo.detached ? `detached at ${repo.head?.slice(0, 7)}` : repo.branch, sync, repo.operation ? `${repo.operation} in progress` : null,
              repo.stats && (repo.stats.insertions || repo.stats.deletions) ? `+${repo.stats.insertions} −${repo.stats.deletions}` : null].filter(Boolean).join(' · ')}
          </Text>
          <Pressable onPress={() => router.push({ pathname: '/graph', params: { projectId, folder: repo.path } })} style={styles.graphLink} accessibilityRole="button">
            <Text style={styles.link}>Git Graph</Text>
          </Pressable>
          <Text style={styles.heading}>{changes.length ? `Changes (${changes.length})` : 'No changes'}</Text>
          {rows.map((row) => row.change ? (
            <Pressable
              key={row.key}
              onPress={() => router.push({ pathname: '/diff', params: { projectId, folder: repo.path, path: row.change!.path } })}
              style={({ pressed }) => [styles.change, { paddingLeft: row.depth * 16 }, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={[styles.letter, { color: STATUS_COLORS[row.change.status] }]}>{statusLetter(row.change)}</Text>
              <Text style={styles.path} numberOfLines={1}>{row.name}</Text>
              {row.change.staged ? <Text style={styles.staged}>staged</Text> : null}
            </Pressable>
          ) : (
            <Text key={row.key} style={[styles.folder, { paddingLeft: row.depth * 16 }]} numberOfLines={1}>{row.name}/</Text>
          ))}
          {repo.commits?.length ? <Text style={styles.heading}>Latest commits</Text> : null}
          {repo.commits?.slice(0, 10).map((commit) => (
            <View key={commit.hash} style={styles.commit}>
              <Text style={styles.subject} numberOfLines={2}>{commit.subject}</Text>
              <Text style={styles.meta}>{commit.shortHash} · {commit.author} · {relativeTime(commit.date)}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerButton: { color: colors.accent, fontSize: 16, paddingHorizontal: spacing.sm },
  empty: { color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  repo: { padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 4 },
  repoName: { color: colors.text, fontSize: 17, fontWeight: '600' },
  meta: { color: colors.textFaint, fontSize: 12 },
  graphLink: { paddingVertical: spacing.sm, alignSelf: 'flex-start' },
  link: { color: colors.accent, fontSize: 15 },
  heading: { color: colors.textDim, fontSize: 13, fontWeight: '600', marginTop: spacing.md, marginBottom: 2 },
  change: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  pressed: { backgroundColor: colors.surface },
  letter: { width: 14, fontFamily: 'Menlo', fontSize: 13, fontWeight: '700' },
  path: { color: colors.text, fontSize: 14, flex: 1 },
  staged: { color: colors.textFaint, fontSize: 11 },
  folder: { color: colors.textDim, fontSize: 14, paddingVertical: 5 },
  commit: { paddingVertical: 6, gap: 2 },
  subject: { color: colors.text, fontSize: 14 },
});
