import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cliLabel, relativeTime, sessionTitle, type RowState, type Session } from '@/sessions/model';
import { colors, spacing } from '@/theme';

const STATE_COLORS: Record<RowState, string> = {
  attention: colors.attention,
  busy: colors.accent,
  unread: colors.unread,
  running: colors.running,
  idle: 'transparent',
};

const STATE_LABELS: Record<RowState, string> = {
  attention: 'waiting for you',
  busy: 'working',
  unread: 'unread',
  running: 'running',
  idle: '',
};

type Props = { session: Session; state: RowState; onPress: (session: Session) => void; onLongPress: (session: Session) => void };

/** One session: its state dot, title, and the CLI, age and size underneath. */
export const SessionRow = memo(function SessionRow({ session, state, onPress, onLongPress }: Props) {
  const meta = [cliLabel(session), relativeTime(session.modified || session.created)];
  if (session.messageCount) meta.push(`${session.messageCount} msgs`);
  if (STATE_LABELS[state]) meta.unshift(STATE_LABELS[state]);
  return (
    <Pressable
      onPress={() => onPress(session)}
      onLongPress={() => onLongPress(session)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${sessionTitle(session)}, ${meta.join(', ')}`}
    >
      <View style={[styles.dot, { backgroundColor: STATE_COLORS[state], borderColor: state === 'idle' ? colors.border : STATE_COLORS[state] }]} />
      <View style={styles.text}>
        <Text style={[styles.title, state === 'unread' && styles.unread]} numberOfLines={1}>
          {sessionTitle(session)}
        </Text>
        <Text style={[styles.meta, (state === 'attention' || state === 'unread') && { color: STATE_COLORS[state] }]} numberOfLines={1}>
          {meta.join(' · ')}
        </Text>
      </View>
      {session.starred ? <Text style={styles.star}>★</Text> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  pressed: { backgroundColor: colors.surface },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1 },
  text: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 15 },
  // Finished while nobody was looking, as the desktop shows it.
  unread: { color: colors.unread, fontWeight: '600' },
  meta: { color: colors.textFaint, fontSize: 12 },
  star: { color: colors.accent, fontSize: 14 },
});
