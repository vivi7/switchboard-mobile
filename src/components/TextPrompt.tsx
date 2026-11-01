import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing } from '@/theme';

/** A small dialog with one text field. Resolves through onSubmit with the trimmed text. */
export function TextPrompt({ visible, title, initialValue = '', confirm = 'Save', onSubmit, onClose }: {
  visible: boolean;
  title: string;
  initialValue?: string;
  confirm?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const submit = () => { onClose(); onSubmit(value.trim()); };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={() => setValue(initialValue)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={submit}
            returnKeyType="done"
            style={styles.input}
            placeholderTextColor={colors.textFaint}
          />
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.button} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: colors.textDim }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={styles.button} accessibilityRole="button">
              <Text style={styles.buttonText}>{confirm}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  dialog: { backgroundColor: colors.raised, borderRadius: 14, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  input: {
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  button: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  buttonText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
