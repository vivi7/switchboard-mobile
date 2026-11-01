import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Sheet, type SheetOption } from '@/components/Sheet';
import { TextPrompt } from '@/components/TextPrompt';
import { forceRetry, pushAction, rowActions, type GraphAction } from '@/git/actions';
import { graphRows, LANE_WIDTH, ROW_HEIGHT, type GraphRow } from '@/git/graph';
import { buildLayoutInput, type GraphCommit, type HistoryRow, type Stash, type Uncommitted } from '@/git/history';
import { relativeTime, shortProjectPath } from '@/sessions/model';
import { onDesktopEvent, request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type Graph = {
  ok?: boolean; error?: string; hasMore: boolean;
  commits: GraphCommit[]; stashes: Stash[]; uncommitted: Uncommitted | null;
  refs: { heads: { name: string; hash: string; isHead: boolean; upstream: string | null }[] } | null;
};

// The desktop's default palette (git-graph-service.js graphColours), until its preferences arrive.
const DEFAULT_COLOURS = [
  '#69c47c', '#df7180', '#e0aa63', '#8992dc',
  '#5fb3d9', '#c77dd1', '#9fd15a', '#e08fb0',
  '#6fa8e0', '#d1a5e0', '#7fd1b8', '#e0c05f',
];
const PAGE = 300;
const MORE = 100;
// The most the computer sends at once.
const MAX_COMMITS = 5000;
// A push or a fetch may take the computer up to two minutes.
const ACTION_TIMEOUT_MS = 130_000;

/** The Git Graph of one repository of a project, with its actions. */
export default function GraphScreen() {
  const { projectId, folder } = useLocalSearchParams<{ projectId: string; folder: string }>();
  const online = useConnection((s) => s.status.state === 'online');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [naming, setNaming] = useState<GraphAction | null>(null);
  const [toolbar, setToolbar] = useState(false);
  const [running, setRunning] = useState<{ label: string; actionId: string; progress: string } | null>(null);

  const graph = useQuery({
    queryKey: ['git-graph', projectId, folder, limit],
    queryFn: () => request<Graph>('get-project-git-graph', [projectId, folder, {
      limit, order: 'date', branches: 'all', showRemote: true, showTags: true, showStashes: true, showUncommittedChanges: true,
    }]),
    enabled: online && !!projectId && !!folder,
    placeholderData: (previous) => previous,
    refetchOnMount: 'always',
  });
  const prefs = useQuery({ queryKey: ['git-graph-preferences'], queryFn: () => request<{ preferences?: { graphColours?: string[] } }>('get-git-graph-global-preferences'), enabled: online });
  // The repository watcher does not see the git config, where remotes live: read them when a menu opens.
  const remotes = useQuery({ queryKey: ['git-remotes', projectId, folder], queryFn: () => request<{ remotes?: { name: string }[] }>('get-git-graph-remotes', [projectId, folder]), enabled: online, refetchOnMount: 'always' });
  const palette = prefs.data?.preferences?.graphColours?.length ? prefs.data.preferences.graphColours : DEFAULT_COLOURS;
  const remoteNames = (remotes.data?.remotes || []).map((r) => r.name);

  const data = graph.data;
  const headHash = data?.commits.find((c) => c.isHead)?.hash || null;
  const currentBranch = data?.refs?.heads.find((h) => h.isHead)?.name || null;
  const upstreams = useMemo(() => Object.fromEntries((data?.refs?.heads || []).map((h) => [h.name, h.upstream])), [data]);
  const { history, layout, lanes } = useMemo(() => {
    const history = data && !data.error ? buildLayoutInput(data.commits, data.stashes, data.uncommitted, headHash) : [];
    const { rows, lanes } = graphRows(history);
    return { history, layout: rows, lanes };
  }, [data, headHash]);

  // The repository changed (here, on the computer, or from a terminal), and the progress of a network action.
  useEffect(() => onDesktopEvent((event, args) => {
    if (event === 'git-graph-repo-changed' && args[0] === folder) graph.refetch();
    if (event === 'git-graph-action-progress' && args[0]?.folderPath === folder) {
      setRunning((r) => (r && r.actionId === args[0].actionId ? { ...r, progress: args[0].text } : r));
    }
  }), [folder, graph]);

  async function run(action: GraphAction) {
    setRunning({ label: action.label, actionId: action.actionId, progress: '' });
    try {
      const result = await request<{ ok?: boolean; error?: string }>('run-git-graph-action', [projectId, folder, action.actionId, action.params], { timeoutMs: ACTION_TIMEOUT_MS });
      if (result?.error) {
        const retry = forceRetry(action, result.error);
        if (retry) confirmThen(retry, run);
        else Alert.alert(action.label, result.error);
      }
    } catch (err: any) {
      Alert.alert(action.label, err.message);
    } finally {
      setRunning(null);
      graph.refetch();
    }
  }

  const choose = (action: GraphAction) => {
    if (action.prompt) setNaming(action);
    else confirmThen(action, run);
  };

  const pushCurrent = currentBranch ? pushAction(currentBranch, upstreams[currentBranch], remoteNames) : null;
  const toolbarOptions: SheetOption[] = [
    ...(remoteNames.length ? [{ label: 'Fetch from all remotes', onPress: () => run({ label: 'Fetch', actionId: 'fetchAllRemotes', params: {} }) }] : []),
    ...(pushCurrent ? [{ label: pushCurrent.label, onPress: () => run(pushCurrent) }] : []),
    { label: 'Review changes', onPress: () => router.push({ pathname: '/git', params: { projectId } }) },
  ];

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: shortProjectPath(folder || ''),
          headerRight: () => (
            <Pressable onPress={() => { remotes.refetch(); setToolbar(true); }} hitSlop={10} accessibilityLabel="Repository actions">
              <Text style={styles.headerButton}>•••</Text>
            </Pressable>
          ),
        }}
      />
      {currentBranch || headHash ? <Text style={styles.branch}>{currentBranch ? `On ${currentBranch}` : `Detached at ${headHash?.slice(0, 7)}`}</Text> : null}
      {running ? (
        <View style={styles.running}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.runningText} numberOfLines={2}>{running.progress || `${running.label}…`}</Text>
          <Pressable onPress={() => request('cancel-git-graph-action', [projectId, folder, running.actionId]).catch(() => {})} hitSlop={10}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      {data?.error || graph.error ? <Text style={styles.empty}>{data?.error || graph.error?.message}</Text> : null}
      <FlatList
        data={history}
        keyExtractor={(row) => row.hash}
        renderItem={({ item, index }) => (
          <CommitRow
            row={item}
            geometry={layout[index]}
            lanes={lanes}
            palette={palette}
            onPress={() => item.kind === 'uncommitted'
              ? router.push({ pathname: '/git', params: { projectId } })
              : item.kind === 'commit' ? router.push({ pathname: '/commit', params: { projectId, folder, hash: item.hash } }) : setSelected(item)}
            onLongPress={() => { remotes.refetch(); setSelected(item); }}
          />
        )}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        initialNumToRender={25}
        windowSize={11}
        refreshControl={<RefreshControl refreshing={graph.isRefetching && !running} onRefresh={() => { graph.refetch(); }} tintColor={colors.accent} />}
        onEndReached={() => { if (data?.hasMore && !graph.isFetching && limit < MAX_COMMITS) setLimit((l) => Math.min(MAX_COMMITS, l + MORE)); }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={graph.isLoading ? <ActivityIndicator style={{ margin: spacing.xl }} color={colors.accent} /> : <Text style={styles.empty}>No commits.</Text>}
        ListFooterComponent={data?.hasMore && limit < MAX_COMMITS ? <ActivityIndicator style={{ margin: spacing.lg }} color={colors.textFaint} /> : undefined}
      />
      <Sheet
        visible={!!selected}
        title={selected ? `${selected.shortHash ? `${selected.shortHash} · ` : ''}${selected.subject}` : ''}
        options={selected ? rowActions(selected, { currentBranch, remotes: remoteNames, upstreams }).map((action) => ({ label: action.label, destructive: action.destructive, onPress: () => choose(action) })) : []}
        onClose={() => setSelected(null)}
      />
      <Sheet visible={toolbar} title={shortProjectPath(folder || '')} options={toolbarOptions} onClose={() => setToolbar(false)} />
      <TextPrompt
        visible={!!naming}
        title={naming?.prompt?.title || ''}
        initialValue={naming?.prompt?.initial || ''}
        confirm="OK"
        onClose={() => setNaming(null)}
        onSubmit={(value) => { if (naming?.prompt && value && value !== naming.prompt.initial) run({ ...naming, params: { ...naming.params, [naming.prompt.key]: value } }); }}
      />
    </View>
  );
}

/** Ask "Are you sure?" first when the desktop does. */
function confirmThen(action: GraphAction, run: (action: GraphAction) => void) {
  if (!action.confirm) { run(action); return; }
  Alert.alert('Are you sure?', action.confirm, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Continue', style: action.destructive ? 'destructive' : 'default', onPress: () => run(action) },
  ]);
}

const CommitRow = memo(function CommitRow({ row, geometry, lanes, palette, onPress, onLongPress }: {
  row: HistoryRow; geometry: GraphRow; lanes: number; palette: string[]; onPress: () => void; onLongPress: () => void;
}) {
  const colour = (index: number) => palette[index % palette.length];
  const refs = row.refs || { heads: [], remotes: [], tags: [] };
  const badges = [
    ...refs.heads.map((name) => ({ key: `h:${name}`, text: name, style: styles.badgeHead })),
    ...refs.remotes.map((r) => ({ key: `r:${r.remote}/${r.name}`, text: `${r.remote}/${r.name}`, style: styles.badgeRemote })),
    ...refs.tags.map((name) => ({ key: `t:${name}`, text: name, style: styles.badgeTag })),
  ];
  const special = row.kind !== 'commit';
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Svg width={Math.max(lanes, 1) * LANE_WIDTH} height={ROW_HEIGHT}>
        {geometry.segments.map((segment, i) => <Path key={i} d={segment.d} stroke={colour(segment.colorIndex)} strokeWidth={2} fill="none" />)}
        <Circle
          cx={geometry.node.x} cy={ROW_HEIGHT / 2} r={row.isHead ? 5 : 4}
          fill={special ? colors.background : colour(geometry.node.colorIndex)}
          stroke={colour(geometry.node.colorIndex)} strokeWidth={special || row.isHead ? 2 : 0}
        />
      </Svg>
      <View style={styles.text}>
        <View style={styles.subjectLine}>
          {badges.slice(0, 3).map((badge) => <Text key={badge.key} style={[styles.badge, badge.style]} numberOfLines={1}>{badge.text}</Text>)}
          {badges.length > 3 ? <Text style={styles.more}>+{badges.length - 3}</Text> : null}
          <Text style={[styles.subject, special && styles.special]} numberOfLines={1}>{row.subject}</Text>
        </View>
        {row.kind === 'commit' ? <Text style={styles.meta} numberOfLines={1}>{row.shortHash} · {row.authorName} · {relativeTime(row.commitDate)}</Text> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerButton: { color: colors.text, fontSize: 18, paddingHorizontal: spacing.sm },
  branch: { color: colors.textDim, fontSize: 12, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  running: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  runningText: { flex: 1, color: colors.text, fontSize: 12, fontFamily: 'Menlo' },
  cancel: { color: colors.danger, fontSize: 14 },
  empty: { color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, paddingLeft: spacing.sm, paddingRight: spacing.md },
  pressed: { backgroundColor: colors.surface },
  text: { flex: 1, marginLeft: spacing.sm, gap: 1 },
  subjectLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subject: { color: colors.text, fontSize: 14, flexShrink: 1 },
  special: { color: colors.textDim, fontStyle: 'italic' },
  meta: { color: colors.textFaint, fontSize: 11 },
  badge: { fontSize: 10, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden', maxWidth: 110, color: colors.text },
  badgeHead: { backgroundColor: 'rgba(128,136,255,0.3)' },
  badgeRemote: { backgroundColor: 'rgba(255,255,255,0.1)', color: colors.textDim },
  badgeTag: { backgroundColor: 'rgba(224,160,80,0.3)' },
  more: { color: colors.textFaint, fontSize: 10 },
});
