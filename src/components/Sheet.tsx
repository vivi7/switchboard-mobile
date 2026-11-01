import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

export type SheetOption = { label: string; onPress: () => void; destructive?: boolean; hint?: string };

/** A bottom sheet of options, the same on iOS and Android. */
export function Sheet({ visible, title, options, onClose, children }: { visible: boolean; title?: string; options?: SheetOption[]; onClose: () => void; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
        {title ? <Text style={styles.title} numberOfLines={2}>{title}</Text> : null}
        <ScrollView style={styles.list}>
          {children}
          {options?.map((option) => (
            <Pressable
              key={option.label}
              onPress={() => { onClose(); option.onPress(); }}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={[styles.label, option.destructive && { color: colors.danger }]}>{option.label}</Text>
              {option.hint ? <Text style={styles.hint}>{option.hint}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={onClose} style={({ pressed }) => [styles.option, styles.cancel, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={[styles.label, { color: colors.textDim }]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.raised,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: spacing.md,
    maxHeight: '75%',
  },
  title: { color: colors.textDim, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  list: { flexGrow: 0 },
  option: { paddingHorizontal: spacing.xl, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cancel: { marginTop: spacing.xs },
  pressed: { backgroundColor: colors.surface },
  label: { color: colors.text, fontSize: 16 },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
});
