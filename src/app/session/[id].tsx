import { useQuery } from '@tanstack/react-query';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatView } from '@/components/ChatView';
import { KeyBar } from '@/components/KeyBar';
import { SessionActions } from '@/components/SessionActions';
import { TerminalView } from '@/components/TerminalView';
import { sessionState, sessionTitle, type Folder, type Session } from '@/sessions/model';
import { onDesktopEvent, request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type Tab = 'chat' | 'terminal';

/** One session: its conversation, its live terminal, and resume or fork when it is not running. */
export default function SessionScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const [sessionId, setSessionId] = useState(params.id);
  const online = useConnection((s) => s.status.state === 'online');
  const live = useConnection((s) => s.live[sessionId]);
  const setViewing = useConnection((s) => s.setViewing);
  const refreshLive = useConnection((s) => s.refreshLive);
  const [actions, setActions] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => request<Folder[]>('get-projects', [false]), enabled: online });
  const session = (projects.data || []).flatMap((f) => f.sessions).find((s) => s.sessionId === sessionId);
  const isTerminal = session?.type === 'terminal';
  const running = sessionState(live) !== 'idle';
  const diffs = useConnection((s) => s.diffs);
  const waiting = Object.values(diffs).filter((d) => d.sessionId === sessionId);
  const [tab, setTab] = useState<Tab>(params.tab === 'terminal' ? 'terminal' : 'chat');
  const shownTab: Tab = isTerminal ? 'terminal' : tab;

  // A fork or a Codex session gets its real id once its transcript appears.
  useEffect(() => onDesktopEvent((event, args) => {
    if ((event === 'session-detected' || event === 'session-forked') && args[0] === sessionId) setSessionId(args[1]);
  }), [sessionId]);

  // While this screen is in front: another screen pushed on top, or going
  // back to it, changes what is on screen without unmounting it.
  useFocusEffect(useCallback(() => {
    setViewing(sessionId);
    return () => { if (useConnection.getState().viewing === sessionId) setViewing(null); };
  }, [sessionId, setViewing]));

  const send = useCallback((data: string) => { request('terminal-input', [sessionId, data]).catch(() => {}); }, [sessionId]);

  const launch = async (mode: 'resume' | 'fork') => {
    setStarting(true);
    try {
      const result = await request<{ sessionId?: string; error?: string }>('launch-session', [{ mode, sessionId }]);
      if (result.error || !result.sessionId) throw new Error(result.error || 'Could not start the session');
      await refreshLive();
      if (mode === 'fork') router.replace({ pathname: '/session/[id]', params: { id: result.sessionId, tab: 'terminal' } });
      else setTab('terminal');
    } catch (err: any) {
      Alert.alert(mode === 'fork' ? 'Could not fork' : 'Could not resume', err.message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <Stack.Screen
        options={{
          title: session ? sessionTitle(session) : 'Session',
          headerRight: () => session ? (
            <Pressable onPress={() => setActions(session)} hitSlop={10} accessibilityLabel="Session actions">
              <Text style={styles.headerButton}>•••</Text>
            </Pressable>
          ) : null,
        }}
      />
      {waiting.length ? (
        <Pressable onPress={() => router.push({ pathname: '/ide-diff', params: { diffId: waiting[0].diffId } })} style={styles.diffBanner} accessibilityRole="button">
          <Text style={styles.diffBannerText} numberOfLines={1}>
            {waiting.length === 1 ? `Wants to change ${waiting[0].oldFilePath.split('/').pop()}` : `${waiting.length} changes to review`} · Review
          </Text>
        </Pressable>
      ) : null}
      {!isTerminal ? (
        <View style={styles.tabs}>
          {(['chat', 'terminal'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, shownTab === t && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: shownTab === t }}>
              <Text style={[styles.tabText, shownTab === t && styles.tabTextOn]}>{t === 'chat' ? 'Chat' : 'Terminal'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!running ? (
        <View style={styles.stopped}>
          {isTerminal ? (
            <Text style={styles.stoppedText}>This terminal has ended.</Text>
          ) : (
            <>
              <Text style={styles.stoppedText}>Not running.</Text>
              {starting ? <ActivityIndicator color={colors.accent} /> : (
                <View style={styles.stoppedActions}>
                  <Pressable onPress={() => launch('resume')} style={styles.primary} accessibilityRole="button"><Text style={styles.primaryText}>Resume</Text></Pressable>
                  <Pressable onPress={() => router.push({ pathname: '/new', params: { mode: 'resume', sessionId } })} style={styles.secondary} accessibilityRole="button"><Text style={styles.secondaryText}>With options…</Text></Pressable>
                  <Pressable onPress={() => launch('fork')} style={styles.secondary} accessibilityRole="button"><Text style={styles.secondaryText}>Fork</Text></Pressable>
                </View>
              )}
            </>
          )}
        </View>
      ) : null}

      <View style={styles.body}>
        {shownTab === 'chat' ? <ChatView sessionId={sessionId} /> : null}
        {shownTab === 'terminal' && running ? <TerminalView key={sessionId} sessionId={sessionId} /> : null}
        {shownTab === 'terminal' && !running ? <View style={styles.flex} /> : null}
      </View>
      {running ? <KeyBar send={send} placeholder={isTerminal ? 'Command…' : 'Message…'} /> : null}
      <SessionActions session={actions} onClose={() => setActions(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  diffBanner: { backgroundColor: 'rgba(224,160,80,0.18)', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  diffBannerText: { color: colors.attention, fontSize: 14, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: { flex: 1 },
  headerButton: { color: colors.accent, fontSize: 18, paddingHorizontal: spacing.sm },
  tabs: { flexDirection: 'row', margin: spacing.md, marginBottom: spacing.xs, backgroundColor: colors.surface, borderRadius: 8, padding: 2 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 6 },
  tabOn: { backgroundColor: colors.raised },
  tabText: { color: colors.textDim, fontSize: 14 },
  tabTextOn: { color: colors.text, fontWeight: '600' },
  stopped: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 10, gap: spacing.sm },
  stoppedText: { color: colors.textDim, fontSize: 14 },
  stoppedActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  primary: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: spacing.lg, paddingVertical: 9 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  secondary: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: 9 },
  secondaryText: { color: colors.text, fontSize: 14 },
});
