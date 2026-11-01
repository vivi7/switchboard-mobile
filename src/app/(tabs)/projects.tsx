import { Redirect, router, Tabs } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { ConnectionBanner } from '@/components/ConnectionBanner';
import { STATE_COLORS } from '@/components/SessionRow';
import { TextPrompt } from '@/components/TextPrompt';
import { groupProjects, projectSessions, rollupState, type Project } from '@/projects/model';
import { act, useMinute, useProjectTree } from '@/projects/queries';
import { relativeTime, type RowState } from '@/sessions/model';
import { projectSnoozed, snoozeWakeDescription } from '@/shared/vendor/snooze';
import { useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type Row = { project: Project; state: RowState };
type Section = { key: 'active' | 'snoozed' | 'done'; title: string; data: Row[]; count: number };

/** Projects, as the desktop's Projects tab lists them: active, snoozed, then done. */
export default function ProjectsScreen() {
  const loaded = useConnection((s) => s.loaded);
  const desktop = useConnection((s) => s.desktop);
  const online = useConnection((s) => s.status.state === 'online');
  const live = useConnection((s) => s.live);
  const notices = useConnection((s) => s.notices);
  const tree = useProjectTree();
  const now = useMinute();
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);

  const sections = useMemo(() => {
    const groups = groupProjects(tree.data?.projects || [], { now, live, notices });
    const rows = (projects: Project[]) => projects.map((project) => ({ project, state: rollupState(projectSessions(project), live, notices) }));
    const out: Section[] = [{ key: 'active', title: 'Active', data: rows(groups.active), count: groups.active.length }];
    if (groups.snoozed.length) out.push({ key: 'snoozed', title: 'Snoozed', data: rows(groups.snoozed), count: groups.snoozed.length });
    if (groups.done.length) out.push({ key: 'done', title: 'Done', data: showDone ? rows(groups.done) : [], count: groups.done.length });
    return out;
  }, [tree.data, now, live, notices, showDone]);

  const create = async (name: string) => {
    if (!name) return;
    try {
      const result = await act<{ project: Project }>('create-project', [{ name }]);
      tree.refetch();
      router.push({ pathname: '/project/[id]', params: { id: result.project.id } });
    } catch (err: any) {
      Alert.alert('Could not create the project', err.message);
    }
  };

  if (!loaded) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  if (!desktop) return <Redirect href="/pair" />;

  return (
    <View style={styles.screen}>
      <Tabs.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => setCreating(true)} hitSlop={10} accessibilityLabel="New project" disabled={!online}>
              <Text style={styles.headerButton}>New</Text>
            </Pressable>
          ),
        }}
      />
      <ConnectionBanner />
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.project.id}
        renderItem={({ item }) => <ProjectRow row={item} now={now} />}
        renderSectionHeader={({ section }) => (
          section.key === 'done' ? (
            <Pressable onPress={() => setShowDone((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showDone }}>
              <Text style={styles.sectionHeader}>{showDone ? '▾' : '▸'} Done ({section.count})</Text>
            </Pressable>
          ) : <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={tree.isRefetching} onRefresh={() => { tree.refetch(); }} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={styles.empty}>{!online ? '' : tree.isLoading ? 'Loading projects…' : 'No projects yet.'}</Text>}
      />
      <TextPrompt visible={creating} title="New project" confirm="Create" onClose={() => setCreating(false)} onSubmit={create} />
    </View>
  );
}

function ProjectRow({ row: { project, state }, now }: { row: Row; now: number }) {
  const tracks = project.tracks.filter((t) => t.status !== 'done').length;
  const sessions = projectSessions(project).filter((s) => !s.archived).length;
  const meta = [
    projectSnoozed(project, now) && project.snoozedUntil
      ? `snoozed until ${snoozeWakeDescription(project.snoozedUntil)}`
      : null,
    tracks ? `${tracks} track${tracks === 1 ? '' : 's'}` : null,
    `${sessions} session${sessions === 1 ? '' : 's'}`,
    relativeTime(project.lastActivity || project.modified),
  ].filter(Boolean);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${project.name}, ${meta.join(', ')}`}
    >
      <View style={[styles.dot, { backgroundColor: STATE_COLORS[state], borderColor: state === 'idle' ? colors.border : STATE_COLORS[state] }]} />
      <View style={styles.text}>
        <Text style={[styles.title, project.status === 'done' && styles.done]} numberOfLines={1}>{project.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>{meta.join(' · ')}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  headerButton: { color: colors.accent, fontSize: 16, paddingHorizontal: spacing.md },
  sectionHeader: { color: colors.textDim, fontSize: 13, fontWeight: '600', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs, backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  pressed: { backgroundColor: colors.surface },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1 },
  text: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 16 },
  done: { color: colors.textDim },
  meta: { color: colors.textFaint, fontSize: 12 },
  empty: { color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl },
});
