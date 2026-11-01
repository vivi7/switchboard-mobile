import { useQuery } from '@tanstack/react-query';
import { Link, Redirect, router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { ConnectionBanner } from '@/components/ConnectionBanner';
import { SessionActions } from '@/components/SessionActions';
import { SessionRow } from '@/components/SessionRow';
import { buildSections, rowState, type Folder, type Session, type SessionFilter } from '@/sessions/model';
import { request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

const FILTERS: { key: SessionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'starred', label: 'Pinned' },
  { key: 'today', label: 'Today' },
];

/** Wait for typing to pause before searching. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export default function SessionsScreen() {
  const loaded = useConnection((s) => s.loaded);
  const desktop = useConnection((s) => s.desktop);
  const online = useConnection((s) => s.status.state === 'online');
  const live = useConnection((s) => s.live);
  const notices = useConnection((s) => s.notices);
  const [filter, setFilter] = useState<SessionFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Session | null>(null);
  const search = useDebounced(query.trim(), 300);

  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => request<Folder[]>('get-projects', [false]),
    enabled: online,
  });
  const allIds = useMemo(() => (projects.data || []).flatMap((f) => f.sessions.map((s) => s.sessionId)), [projects.data]);
  // Full-text search on the computer, over what was said, not just titles.
  const matches = useQuery({
    queryKey: ['search', search, allIds.length],
    queryFn: () => request<string[]>('search-session-ids', [search, allIds]),
    enabled: online && search.length > 1 && allIds.length > 0,
  });
  const sections = useMemo(
    () => buildSections(projects.data || [], { filter, live, matches: search.length > 1 ? new Set(matches.data || []) : null }),
    [projects.data, filter, live, search, matches.data],
  );

  const open = useCallback((session: Session) => router.push({ pathname: '/session/[id]', params: { id: session.sessionId } }), []);
  const showActions = useCallback((session: Session) => setSelected(session), []);
  const renderItem = useCallback(
    ({ item }: { item: Session }) => <SessionRow session={item} state={rowState(item.sessionId, live[item.sessionId], notices)} onPress={open} onLongPress={showActions} />,
    [live, notices, open, showActions],
  );

  if (!loaded) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  if (!desktop) return <Redirect href="/pair" />;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: desktop.name,
          headerLeft: () => (
            <Link href="/settings" asChild>
              <Pressable hitSlop={10} accessibilityLabel="Computer settings">
                <Text style={styles.headerButton}>Computer</Text>
              </Pressable>
            </Link>
          ),
          headerRight: () => (
            <Link href="/new" asChild>
              <Pressable hitSlop={10} accessibilityLabel="New session">
                <Text style={styles.headerButton}>New</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <ConnectionBanner />
      <View style={styles.controls}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search sessions…"
          placeholderTextColor={colors.textFaint}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: filter === f.key }}>
              <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.sessionId}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader} numberOfLines={1}>{section.title}</Text>}
        stickySectionHeadersEnabled
        initialNumToRender={20}
        refreshControl={<RefreshControl refreshing={projects.isRefetching} onRefresh={() => { projects.refetch(); }} tintColor={colors.accent} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {!online ? '' : projects.isLoading ? 'Loading sessions…' : search.length > 1 ? 'No session matches.' : 'No sessions here.'}
          </Text>
        }
      />
      <SessionActions session={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  headerButton: { color: colors.accent, fontSize: 15 },
  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  search: {
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 15,
  },
  filters: { flexDirection: 'row', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: 'rgba(128,136,255,0.18)', borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: 13 },
  chipTextActive: { color: colors.text },
  sectionHeader: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  empty: { color: colors.textFaint, textAlign: 'center', padding: spacing.xl },
});
