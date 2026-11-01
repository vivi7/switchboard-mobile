import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';

/** A titled block of the project page, with an optional action on the right. */
export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
            <Text style={styles.action}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** A quiet row that adds something: "Add a todo…". */
export function SectionLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]} accessibilityRole="button">
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/** A row with a title, a line under it and an optional long press. */
export function InfoRow({ title, meta, onPress, onLongPress, dim }: { title: string; meta?: string; onPress?: () => void; onLongPress?: () => void; dim?: boolean }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole={onPress ? 'button' : undefined}>
      <Text style={[styles.rowTitle, dim && { color: colors.textDim }]} numberOfLines={1}>{title}</Text>
      {meta ? <Text style={styles.rowMeta} numberOfLines={2}>{meta}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { color: colors.textDim, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  action: { color: colors.accent, fontSize: 14 },
  link: { paddingVertical: spacing.sm },
  linkText: { color: colors.accent, fontSize: 14 },
  row: { paddingVertical: spacing.sm, gap: 2 },
  pressed: { backgroundColor: colors.raised },
  rowTitle: { color: colors.text, fontSize: 15 },
  rowMeta: { color: colors.textFaint, fontSize: 12 },
});
