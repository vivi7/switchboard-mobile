import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { limitRows, recentActivity, type LimitRow } from '@/usage/model';
import { request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

const DAYS = 14;

/** Usage limits of Claude and Codex on the computer, and Claude's recent activity. */
export default function UsageScreen() {
  const online = useConnection((s) => s.status.state === 'online');
  // Limits change as sessions run: read them again on every visit.
  const claude = useQuery({ queryKey: ['usage', 'claude'], queryFn: () => request('get-usage'), enabled: online, refetchOnMount: 'always' });
  const codex = useQuery({ queryKey: ['usage', 'codex'], queryFn: () => request('get-codex-usage'), enabled: online, refetchOnMount: 'always' });
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => request('get-stats'), enabled: online, refetchOnMount: 'always' });
  // Up to the day the stats were last worked out, which can be a while ago.
  const days = useMemo(() => recentActivity(stats.data, DAYS, (stats.data as any)?.lastComputedDate || new Date().toISOString().slice(0, 10)), [stats.data]);
  const most = Math.max(1, ...days.map((d) => d.messages));
  const refreshing = claude.isRefetching || codex.isRefetching || stats.isRefetching;
  const s: any = stats.data;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { claude.refetch(); codex.refetch(); stats.refetch(); }} tintColor={colors.accent} />}
    >
      <Stack.Screen options={{ title: 'Usage' }} />
      <Limits title="Claude" loading={claude.isLoading} usage={claude.data} />
      <Limits title="Codex" loading={codex.isLoading} usage={codex.data} />
      {s ? (
        <View style={styles.block}>
          <Text style={styles.title}>Claude activity</Text>
          <Text style={styles.meta}>
            {[s.totalSessions != null ? `${s.totalSessions} sessions` : null, s.totalMessages != null ? `${s.totalMessages} messages` : null,
              s.firstSessionDate ? `since ${new Date(s.firstSessionDate).toLocaleDateString()}` : null].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.chart} accessibilityLabel={`Messages per day, last ${DAYS} days`}>
            {days.map((day) => (
              <View key={day.date} style={styles.barSlot}>
                <View style={[styles.bar, { height: `${Math.round((day.messages / most) * 100)}%` }]} />
              </View>
            ))}
          </View>
          <Text style={styles.meta}>Messages per day, {DAYS} days{s.lastComputedDate ? ` up to ${new Date(s.lastComputedDate).toLocaleDateString()}` : ''}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Limits({ title, loading, usage }: { title: string; loading: boolean; usage: unknown }) {
  const { rows, note } = limitRows(usage);
  return (
    <View style={styles.block}>
      <Text style={styles.title}>{title}</Text>
      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {!loading && note ? <Text style={styles.meta}>{note}</Text> : null}
      {rows.map((row) => <LimitBar key={row.label} row={row} />)}
    </View>
  );
}

function LimitBar({ row }: { row: LimitRow }) {
  return (
    <View style={styles.limit}>
      <View style={styles.limitHead}>
        <Text style={styles.label}>{row.label}</Text>
        <Text style={[styles.percent, row.warning && { color: colors.attention }]}>{row.percent}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, row.percent)}%` }, row.warning && { backgroundColor: colors.attention }]} />
      </View>
      {row.reset ? <Text style={styles.meta}>Resets {row.reset}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  block: { gap: spacing.sm },
  title: { color: colors.text, fontSize: 17, fontWeight: '600' },
  meta: { color: colors.textFaint, fontSize: 12 },
  limit: { gap: 4 },
  limitHead: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.textDim, fontSize: 14 },
  percent: { color: colors.text, fontSize: 14, fontWeight: '600' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 3 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: colors.accent, borderRadius: 2, minHeight: 2 },
});
