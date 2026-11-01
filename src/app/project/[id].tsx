import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlanSection } from '@/components/project/PlanSection';
import { InfoRow, Section, SectionLink } from '@/components/project/Section';
import { StartSheet, type StartRequest } from '@/components/project/StartSheet';
import { SessionActions } from '@/components/SessionActions';
import { SessionRow } from '@/components/SessionRow';
import { Sheet, type SheetOption } from '@/components/Sheet';
import { TextPrompt } from '@/components/TextPrompt';
import { projectSessions, rollupState, scheduleSummary, type Project, type ProjectFolder, type Schedule, type Track } from '@/projects/model';
import { act, useMinute, useProject, useProjectPlan } from '@/projects/queries';
import { relativeTime, rowState, shortProjectPath, type Session } from '@/sessions/model';
import { projectSnoozed, resolveSnoozePresets, snoozeWakeDescription } from '@/shared/vendor/snooze';
import { useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type Rename = { kind: 'project' | 'track' | 'new-track'; id: string; name: string };

/** One project: its plan and todos, tracks and sessions, folders, schedules and files. */
export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { project, isLoading, refetch, isRefetching } = useProject(id);
  const plan = useProjectPlan(id);
  const live = useConnection((s) => s.live);
  const notices = useConnection((s) => s.notices);
  const now = useMinute();

  const [actions, setActions] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [rename, setRename] = useState<Rename | null>(null);
  const [trackActions, setTrackActions] = useState<Track | null>(null);
  const [folderActions, setFolderActions] = useState<ProjectFolder | null>(null);
  const [scheduleActions, setScheduleActions] = useState<Schedule | null>(null);
  const [sessionActions, setSessionActions] = useState<Session | null>(null);
  const [start, setStart] = useState<StartRequest | null>(null);

  const refresh = useCallback(() => { refetch(); plan.refetch(); }, [refetch, plan]);
  const run = async (method: string, params: unknown[], after?: () => void) => {
    try { await act(method, params); after?.(); } catch (err: any) { Alert.alert('That did not work', err.message); }
    refresh();
  };

  if (!project) {
    return <View style={styles.center}>{isLoading ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.empty}>This project is gone.</Text>}</View>;
  }

  const snoozed = projectSnoozed(project, now);
  const state = rollupState(projectSessions(project), live, notices);
  const status = project.status === 'done' ? 'Done' : snoozed ? `Snoozed until ${snoozeWakeDescription(project.snoozedUntil!)}` : null;
  const openSession = (session: Session) => router.push({ pathname: '/session/[id]', params: { id: session.sessionId } });
  const sessionRow = (session: Session) => (
    <SessionRow key={session.sessionId} inset session={session} state={rowState(session.sessionId, live[session.sessionId], notices)} onPress={openSession} onLongPress={setSessionActions} />
  );
  const roots = [{ path: project.root, title: 'Project folder', hint: 'plan, memory, notes' }, ...project.folders.map((f) => ({ path: f.path, title: shortProjectPath(f.path), hint: f.mode === 'worktree' ? `worktree${f.branch ? ` · ${f.branch}` : ''}` : 'folder' }))];

  const projectOptions: SheetOption[] = [
    { label: 'New session…', onPress: () => router.push({ pathname: '/new', params: { target: `p:${project.id}` } }) },
    { label: 'Rename…', onPress: () => setRename({ kind: 'project', id: project.id, name: project.name }) },
    { label: 'New track…', onPress: () => setRename({ kind: 'new-track', id: project.id, name: '' }) },
    { label: 'Attach a folder…', onPress: () => router.push({ pathname: '/folders', params: { projectId: project.id } }) },
    ...(project.status === 'done' ? [] : snoozed
      ? [{ label: 'Wake now', onPress: () => run('update-project', [project.id, { snoozedUntil: null }]) }]
      : [{ label: 'Snooze…', onPress: () => setSnoozing(true) }]),
    project.status === 'done'
      ? { label: 'Reopen', onPress: () => run('update-project', [project.id, { status: 'active' }]) }
      : { label: 'Mark as done', onPress: () => run('update-project', [project.id, { status: 'done' }]) },
    {
      label: 'Delete project…', destructive: true,
      onPress: () => Alert.alert(`Delete “${project.name}”?`, 'Switchboard forgets the project. Its folder and sessions stay.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => run('delete-project', [project.id], () => router.back()) },
      ]),
    },
  ];

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: project.name,
          headerRight: () => (
            <Pressable onPress={() => setActions(true)} hitSlop={10} accessibilityLabel="Project actions">
              <Text style={styles.headerButton}>•••</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView refreshControl={<RefreshControl refreshing={isRefetching || plan.isRefetching} onRefresh={refresh} tintColor={colors.accent} />}>
        {status || state !== 'idle' ? (
          <Text style={styles.status}>{[status, state === 'attention' ? 'a session needs you' : state === 'busy' ? 'working' : state === 'unread' ? 'unread' : null].filter(Boolean).join(' · ')}</Text>
        ) : null}

        {plan.data && !plan.data.error ? (
          <PlanSection projectId={project.id} data={plan.data} onChanged={() => plan.refetch()} onStart={setStart} />
        ) : plan.isLoading ? <ActivityIndicator style={{ margin: spacing.lg }} color={colors.accent} /> : null}

        {project.tracks.map((track) => (
          <Section key={track.id} title={`${track.name}${track.status === 'done' ? ' · done' : ''}`} action="•••" onAction={() => setTrackActions(track)}>
            {track.sessions.filter((s) => !s.archived).map(sessionRow)}
            {!track.sessions.some((s) => !s.archived) ? <Text style={styles.empty}>No sessions in this track.</Text> : null}
          </Section>
        ))}

        <Section title={project.tracks.length ? 'Other sessions' : 'Sessions'} action="New" onAction={() => router.push({ pathname: '/new', params: { target: `p:${project.id}` } })}>
          {project.sessions.filter((s) => !s.archived).map(sessionRow)}
          {!project.sessions.some((s) => !s.archived) ? <Text style={styles.empty}>No sessions yet.</Text> : null}
        </Section>

        <Section title="Schedules" action="New" onAction={() => router.push({ pathname: '/schedule', params: { projectId: project.id } })}>
          {project.schedules.map((schedule) => (
            <InfoRow
              key={schedule.id}
              title={schedule.name}
              meta={[scheduleSummary(schedule), schedule.lastRunAt ? `last run ${relativeTime(schedule.lastRunAt)}` : null].filter(Boolean).join(' · ')}
              dim={!schedule.enabled}
              onPress={() => setScheduleActions(schedule)}
            />
          ))}
          {!project.schedules.length ? <Text style={styles.empty}>Nothing scheduled.</Text> : null}
        </Section>

        <Section title="Files">
          {roots.map((root) => (
            <InfoRow key={root.path} title={root.title} meta={root.hint} onPress={() => router.push({ pathname: '/files', params: { root: root.path, title: root.title } })}
              onLongPress={root.path === project.root ? undefined : () => setFolderActions(project.folders.find((f) => f.path === root.path) || null)} />
          ))}
          <SectionLink label="Attach a folder…" onPress={() => router.push({ pathname: '/folders', params: { projectId: project.id } })} />
        </Section>
      </ScrollView>

      <Sheet visible={actions} title={project.name} options={projectOptions} onClose={() => setActions(false)} />
      <Sheet
        visible={snoozing}
        title="Snooze until"
        options={resolveSnoozePresets().map((preset) => ({ label: preset.label, hint: preset.whenLabel, onPress: () => run('update-project', [project.id, { snoozedUntil: preset.snoozedUntil }]) }))}
        onClose={() => setSnoozing(false)}
      />
      <Sheet visible={!!trackActions} title={trackActions?.name} options={trackActions ? trackOptions(project, trackActions, run, setRename) : []} onClose={() => setTrackActions(null)} />
      <Sheet
        visible={!!folderActions}
        title={folderActions ? shortProjectPath(folderActions.path) : ''}
        options={folderActions ? [{
          label: folderActions.mode === 'worktree' ? 'Detach and remove the worktree' : 'Detach from the project', destructive: true,
          onPress: () => {
            const folder = folderActions;
            if (folder.mode !== 'worktree') { run('detach-project-folder', [project.id, folder.path, { removeWorktree: false }]); return; }
            Alert.alert('Remove the worktree?', `${shortProjectPath(folder.path)} is deleted from disk, with files git ignores (such as .env copies). Its branch stays.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => run('detach-project-folder', [project.id, folder.path, { removeWorktree: true }]) },
            ]);
          },
        }] : []}
        onClose={() => setFolderActions(null)}
      />
      <Sheet visible={!!scheduleActions} title={scheduleActions?.name} options={scheduleActions ? scheduleOptions(project, scheduleActions, run) : []} onClose={() => setScheduleActions(null)} />
      <SessionActions session={sessionActions} onClose={() => setSessionActions(null)} />
      <StartSheet project={project} start={start} onClose={() => setStart(null)} />
      <TextPrompt
        visible={!!rename}
        title={rename?.kind === 'new-track' ? 'New track' : 'Rename'}
        initialValue={rename?.name || ''}
        confirm={rename?.kind === 'new-track' ? 'Create' : 'Rename'}
        onClose={() => setRename(null)}
        onSubmit={(name) => {
          if (!rename || !name || name === rename.name) return;
          if (rename.kind === 'project') run('update-project', [rename.id, { name }]);
          else if (rename.kind === 'track') run('update-track', [rename.id, { name }]);
          else run('create-track', [rename.id, { name }]);
        }}
      />
    </View>
  );
}

type Run = (method: string, params: unknown[], after?: () => void) => Promise<void>;

function trackOptions(project: Project, track: Track, run: Run, setRename: (r: Rename) => void): SheetOption[] {
  return [
    { label: 'New session here…', onPress: () => router.push({ pathname: '/new', params: { target: `t:${track.id}` } }) },
    { label: 'Rename…', onPress: () => setRename({ kind: 'track', id: track.id, name: track.name }) },
    track.status === 'done'
      ? { label: 'Reopen', onPress: () => run('update-track', [track.id, { status: 'active' }]) }
      : { label: 'Mark as done', onPress: () => run('update-track', [track.id, { status: 'done' }]) },
    {
      label: 'Delete track…', destructive: true,
      onPress: () => Alert.alert(`Delete “${track.name}”?`, `Its sessions stay in ${project.name}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => run('delete-track', [track.id, { archiveSessions: false }]) },
      ]),
    },
  ];
}

function scheduleOptions(project: Project, schedule: Schedule, run: Run): SheetOption[] {
  return [
    {
      label: 'Run now', onPress: () => run('run-schedule', [schedule.id]).then(() => {
        useConnection.getState().refreshLive();
      }),
    },
    { label: 'Edit…', onPress: () => router.push({ pathname: '/schedule', params: { projectId: project.id, id: schedule.id } }) },
    { label: schedule.enabled ? 'Pause' : 'Resume', onPress: () => run('update-schedule', [schedule.id, { enabled: !schedule.enabled }]) },
    {
      label: 'Delete…', destructive: true,
      onPress: () => Alert.alert(`Delete “${schedule.name}”?`, 'Sessions it already started are kept.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => run('delete-schedule', [schedule.id]) },
      ]),
    },
  ];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  headerButton: { color: colors.text, fontSize: 18, paddingHorizontal: spacing.sm },
  status: { color: colors.textDim, fontSize: 13, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  empty: { color: colors.textFaint, fontSize: 13, paddingVertical: spacing.sm },
});
