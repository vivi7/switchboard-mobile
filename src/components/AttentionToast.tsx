import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queryClient } from '@/remote/query';
import { sessionTitle, type Folder } from '@/sessions/model';
import { onDesktopEvent, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type Notice = { sessionId: string; title: string; text: string; kind: 'attention' | 'idle' };

const SHOW_MS = 6000;

/**
 * While the app is open: a session you are not looking at asks for you
 * (a permission, a question) or finishes its turn. Tap to open it.
 */
export function AttentionToast() {
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => onDesktopEvent((event, args) => {
    if (event !== 'terminal-notification') return;
    const [sessionId, message, kind] = args;
    if ((kind !== 'attention' && kind !== 'idle') || sessionId === useConnection.getState().viewing) return;
    const folders = queryClient.getQueryData<Folder[]>(['projects']) || [];
    const session = folders.flatMap((f) => f.sessions).find((s) => s.sessionId === sessionId);
    setNotice({
      sessionId,
      title: session ? sessionTitle(session) : 'A session',
      text: kind === 'attention' ? (message || 'needs you') : 'finished and is waiting for you',
      kind,
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), SHOW_MS);
  }), []);

  if (!notice) return null;
  return (
    <Pressable
      onPress={() => { setNotice(null); router.push({ pathname: '/session/[id]', params: { id: notice.sessionId } }); }}
      style={[styles.toast, { top: insets.top + spacing.sm }, notice.kind === 'attention' && styles.attention]}
      accessibilityRole="alert"
    >
      <Text style={styles.title} numberOfLines={1}>{notice.title}</Text>
      <Text style={styles.text} numberOfLines={2}>{notice.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.raised,
    borderRadius: 12,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  attention: { borderLeftColor: colors.attention },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  text: { color: colors.textDim, fontSize: 13, marginTop: 2 },
});
