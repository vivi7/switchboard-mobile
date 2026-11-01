import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { scheduleFields, scheduleSummary, type Schedule } from '@/projects/model';
import { act, useProject } from '@/projects/queries';
import { request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type Every = Exclude<Schedule['every'], 'cron'>;
const EVERY: { key: Every; label: string }[] = [
  { key: '15m', label: '15 min' }, { key: '30m', label: '30 min' }, { key: 'hour', label: 'Hourly' },
  { key: 'day', label: 'Daily' }, { key: 'weekdays', label: 'Weekdays' }, { key: 'week', label: 'Weekly' },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A new schedule for a project (projectId), or one to change (id). */
export default function ScheduleScreen() {
  const { projectId, id } = useLocalSearchParams<{ projectId: string; id?: string }>();
  const { project } = useProject(projectId);
  const existing = project?.schedules.find((s) => s.id === id);
  const online = useConnection((s) => s.status.state === 'online');
  const harnesses = useQuery({ queryKey: ['harnesses'], queryFn: () => request<{ id: string; label: string; enabled: boolean }[]>('get-harnesses'), enabled: online });

  const [name, setName] = useState(existing?.name || '');
  const [prompt, setPrompt] = useState(existing?.prompt || '');
  const [every, setEvery] = useState<Every>(existing && existing.every !== 'cron' ? existing.every : 'day');
  const [time, setTime] = useState(`${existing?.atHour ?? 9}:${String(existing?.atMinute ?? 0).padStart(2, '0')}`);
  const [minute, setMinute] = useState(String(existing?.atMinute ?? 0));
  const [weekday, setWeekday] = useState(existing?.weekday ?? 1);
  const [trackId, setTrackId] = useState<string | null>(existing?.trackId || null);
  const [cli, setCli] = useState<string | null>(existing?.cli || null);
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [timingChanged, setTimingChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const timing = <T,>(set: (value: T) => void) => (value: T) => { setTimingChanged(true); set(value); };
  // A cron set on the computer stays until another timing is picked.
  const keepsCron = existing?.every === 'cron' && !timingChanged;

  const save = async () => {
    const { fields, error } = scheduleFields(existing, { name, prompt, every, time, minute, weekday, trackId, cli, enabled, timingChanged });
    if (error) return Alert.alert(error);
    setSaving(true);
    try {
      if (existing) await act('update-schedule', [existing.id, fields]);
      else await act('create-schedule', [{ ...fields, projectId }]);
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save the schedule', err.message);
    } finally {
      setSaving(false);
    }
  };

  const tracks = (project?.tracks || []).filter((t) => t.status !== 'done' || t.id === trackId);
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <Stack.Screen
        options={{
          title: existing ? 'Edit schedule' : 'New schedule',
          headerRight: () => <Pressable onPress={save} disabled={saving} hitSlop={10}><Text style={styles.headerButton}>{saving ? 'Saving…' : 'Save'}</Text></Pressable>,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Label>Name</Label>
        <TextInput value={name} onChangeText={setName} placeholder="Nightly check" placeholderTextColor={colors.textFaint} style={styles.input} />
        <Label>Prompt</Label>
        <TextInput value={prompt} onChangeText={setPrompt} placeholder="What the session should do" placeholderTextColor={colors.textFaint} style={[styles.input, styles.prompt]} multiline textAlignVertical="top" />
        <Label>Runs</Label>
        {keepsCron ? <Text style={styles.hint}>{scheduleSummary(existing)}, set on the computer. Pick another timing to replace it.</Text> : null}
        <Chips items={EVERY} selected={keepsCron ? null : every} onSelect={timing(setEvery)} />
        {keepsCron ? null : every === 'hour' ? (
          <TextInput value={minute} onChangeText={timing(setMinute)} keyboardType="number-pad" placeholder="Minute" placeholderTextColor={colors.textFaint} style={[styles.input, styles.short]} />
        ) : every === 'day' || every === 'weekdays' || every === 'week' ? (
          <TextInput value={time} onChangeText={timing(setTime)} keyboardType="numbers-and-punctuation" placeholder="9:30" placeholderTextColor={colors.textFaint} style={[styles.input, styles.short]} />
        ) : null}
        {!keepsCron && every === 'week' ? <Chips items={DAYS.map((label, key) => ({ key, label }))} selected={weekday} onSelect={timing(setWeekday)} /> : null}
        {tracks.length ? (
          <>
            <Label>Where</Label>
            <Chips items={[{ key: null as string | null, label: project?.name || 'Project' }, ...tracks.map((t) => ({ key: t.id as string | null, label: t.name }))]} selected={trackId} onSelect={setTrackId} />
          </>
        ) : null}
        <Label>CLI</Label>
        <Chips
          items={[{ key: null as string | null, label: 'Default' }, ...(harnesses.data || []).filter((h) => h.enabled).map((h) => ({ key: h.id as string | null, label: h.label }))]}
          selected={cli}
          onSelect={setCli}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>On</Text>
          <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: colors.accent }} />
        </View>
        <Text style={styles.hint}>Runs on the computer while Switchboard is open, with the options set for it there.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Chips<K>({ items, selected, onSelect }: { items: { key: K; label: string }[]; selected: K | null; onSelect: (key: K) => void }) {
  return (
    <View style={styles.chips}>
      {items.map((item) => (
        <Pressable key={String(item.key)} onPress={() => onSelect(item.key)} style={[styles.chip, selected === item.key && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: selected === item.key }}>
          <Text style={[styles.chipText, selected === item.key && styles.chipTextOn]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  headerButton: { color: colors.accent, fontSize: 16, fontWeight: '600', paddingHorizontal: spacing.sm },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '600', marginTop: spacing.md },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15 },
  prompt: { minHeight: 110 },
  short: { width: 110 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  chipOn: { borderColor: colors.accent, backgroundColor: 'rgba(128,136,255,0.15)' },
  chipText: { color: colors.textDim, fontSize: 13 },
  chipTextOn: { color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  switchLabel: { color: colors.text, fontSize: 15 },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: spacing.md },
});
