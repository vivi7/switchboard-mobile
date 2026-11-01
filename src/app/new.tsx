import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { OptionsForm, type Options } from '@/components/OptionsForm';
import { sessionTitle, shortProjectPath, type Folder } from '@/sessions/model';
import { fieldsFor } from '@/shared/vendor/session-config';
import { request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type Target = { key: string; label: string; hint: string; projectPath: string; projectId?: string; trackId?: string };
type Track = { id: string; name: string; cwd?: string | null; status?: string };
type ProjectNode = { id: string; name: string; root: string; defaultCwd?: string | null; status?: string; tracks?: Track[] };
type Harness = { id: string; label: string; enabled: boolean };

const TARGETS_SHOWN = 6;

/** Where a session can start: project tracks and projects (as the desktop's launchTargetFor picks the folder), then recent folders. */
function targetsOf(tree: ProjectNode[], folders: Folder[]): Target[] {
  const targets: Target[] = [];
  for (const project of tree.filter((p) => p.status !== 'done')) {
    const projectPath = project.defaultCwd || project.root;
    targets.push({ key: `p:${project.id}`, label: project.name, hint: 'project', projectPath, projectId: project.id });
    for (const track of (project.tracks || []).filter((t) => t.status !== 'done')) {
      targets.push({ key: `t:${track.id}`, label: `${project.name} › ${track.name}`, hint: 'track', projectPath: track.cwd || projectPath, projectId: project.id, trackId: track.id });
    }
  }
  const seen = new Set(targets.map((t) => t.projectPath));
  for (const folder of folders) {
    if (seen.has(folder.projectPath)) continue;
    seen.add(folder.projectPath);
    targets.push({ key: `f:${folder.projectPath}`, label: shortProjectPath(folder.projectPath), hint: folder.projectPath, projectPath: folder.projectPath });
    if (targets.length > 40) break;
  }
  return targets;
}

/**
 * Start a session (mode=new) or resume one with chosen options
 * (mode=resume&sessionId=…), through the computer's launch-session.
 */
export default function NewSessionScreen() {
  const params = useLocalSearchParams<{ mode?: 'new' | 'resume'; sessionId?: string }>();
  const resume = params.mode === 'resume' && !!params.sessionId;
  const online = useConnection((s) => s.status.state === 'online');
  const refreshLive = useConnection((s) => s.refreshLive);

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => request<Folder[]>('get-projects', [false]), enabled: online });
  const tree = useQuery({ queryKey: ['project-tree'], queryFn: () => request<{ projects: ProjectNode[] }>('get-project-tree', [false]), enabled: online && !resume });
  const harnesses = useQuery({ queryKey: ['harnesses'], queryFn: () => request<Harness[]>('get-harnesses'), enabled: online });
  const resumed = resume ? (projects.data || []).flatMap((f) => f.sessions).find((s) => s.sessionId === params.sessionId) : undefined;

  const targets = useMemo(() => targetsOf(tree.data?.projects || [], projects.data || []), [tree.data, projects.data]);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const target = resume ? null : targets.find((t) => t.key === targetKey) || targets[0];
  // The first few, and the chosen one; the rest behind "Show all".
  const shownTargets = showAll ? targets : targets.filter((t, i) => i < TARGETS_SHOWN || t.key === target?.key);
  const projectPath = resume ? resumed?.projectPath : target?.projectPath;

  const runtimes = [...(harnesses.data || []).filter((h) => h.enabled).map((h) => ({ id: h.id, label: h.label })), ...(resume ? [] : [{ id: 'terminal', label: 'Terminal' }])];
  const [runtimeChoice, setRuntime] = useState<string | null>(null);
  const runtime = resume ? resumed?.runtime || 'claude' : runtimeChoice || runtimes[0]?.id || 'claude';

  // The folder's defaults, then whatever is changed here.
  const defaults = useQuery({
    queryKey: ['effective-settings', projectPath],
    queryFn: () => request<Options>('get-effective-settings', [projectPath]),
    enabled: online && !!projectPath,
  });
  const [edits, setEdits] = useState<Options>({});
  // Only the options this CLI reads, as the desktop's form sends them.
  const keys = new Set(fieldsFor(runtime).map((f) => f.key));
  const options = Object.fromEntries(Object.entries({ ...(defaults.data || {}), ...edits }).filter(([key]) => keys.has(key)));
  const [prompt, setPrompt] = useState('');
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const spec = resume
        ? { mode: 'resume', sessionId: params.sessionId, options }
        : {
          mode: 'new', projectPath, projectId: target?.projectId, trackId: target?.trackId, runtime,
          ...(runtime === 'terminal' ? {} : { options, ...(prompt.trim() ? { initialPrompt: prompt.trim() } : {}) }),
        };
      const result = await request<{ sessionId?: string; error?: string }>('launch-session', [spec]);
      if (result.error || !result.sessionId) throw new Error(result.error || 'Could not start the session');
      await refreshLive();
      router.replace({ pathname: '/session/[id]', params: { id: result.sessionId, tab: 'terminal' } });
    } catch (err: any) {
      Alert.alert('Could not start', err.message);
    } finally {
      setStarting(false);
    }
  };

  const loading = projects.isLoading || harnesses.isLoading || (!resume && tree.isLoading);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: resume ? 'Resume with options' : 'New session' }} />
      {loading ? <ActivityIndicator color={colors.accent} /> : null}

      {resume ? (
        <Text style={styles.text}>{resumed ? sessionTitle(resumed) : params.sessionId}</Text>
      ) : (
        <>
          <Text style={styles.label}>Where</Text>
          <View style={styles.list}>
            {shownTargets.map((t) => (
              <Pressable key={t.key} onPress={() => setTargetKey(t.key)} style={[styles.target, target?.key === t.key && styles.targetOn]} accessibilityRole="radio" accessibilityState={{ selected: target?.key === t.key }}>
                <Text style={styles.targetLabel} numberOfLines={1}>{t.label}</Text>
                <Text style={styles.targetHint} numberOfLines={1}>{t.hint}</Text>
              </Pressable>
            ))}
          </View>
          {targets.length > shownTargets.length ? (
            <Pressable onPress={() => setShowAll(true)} accessibilityRole="button">
              <Text style={styles.showAll}>Show all {targets.length}</Text>
            </Pressable>
          ) : null}
          <Text style={styles.label}>With</Text>
          <View style={styles.chips}>
            {runtimes.map((r) => (
              <Pressable key={r.id} onPress={() => setRuntime(r.id)} style={[styles.chip, runtime === r.id && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: runtime === r.id }}>
                <Text style={[styles.chipText, runtime === r.id && styles.chipTextOn]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          {runtime !== 'terminal' ? (
            <>
              <Text style={styles.label}>First message (optional)</Text>
              <TextInput value={prompt} onChangeText={setPrompt} multiline placeholder="What should it work on?" placeholderTextColor={colors.textFaint} style={[styles.input, styles.prompt]} />
            </>
          ) : null}
        </>
      )}

      {runtime !== 'terminal' && projectPath ? (
        <>
          <Text style={styles.label}>Options</Text>
          <OptionsForm runtime={runtime} values={options} onChange={(next) => setEdits({ ...edits, ...next })} />
        </>
      ) : null}

      <Pressable onPress={start} disabled={starting || !projectPath} style={[styles.primary, (starting || !projectPath) && { opacity: 0.5 }]} accessibilityRole="button">
        {starting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{resume ? 'Resume' : 'Start'}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  text: { color: colors.text, fontSize: 16 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginTop: spacing.sm },
  list: { borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface },
  target: { paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  targetOn: { backgroundColor: 'rgba(128,136,255,0.18)' },
  targetLabel: { color: colors.text, fontSize: 15 },
  targetHint: { color: colors.textFaint, fontSize: 12 },
  showAll: { color: colors.accent, fontSize: 14 },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: 'rgba(128,136,255,0.18)', borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: 14 },
  chipTextOn: { color: colors.text },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15 },
  prompt: { minHeight: 90, textAlignVertical: 'top' },
  primary: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: spacing.md },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
