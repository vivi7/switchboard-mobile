import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing } from '@/theme';

// Keys a phone keyboard lacks or hides, as the bytes a terminal expects.
// Shift+Enter is the same CSI u sequence the desktop sends (public/terminal-manager.js),
// which Claude Code reads as a new line in the prompt.
const KEYS: { label: string; data: string; hint: string }[] = [
  { label: 'Esc', data: '\x1b', hint: 'Escape' },
  { label: 'Tab', data: '\t', hint: 'Tab' },
  { label: '⇧Tab', data: '\x1b[Z', hint: 'Shift Tab' },
  { label: '↑', data: '\x1b[A', hint: 'Up' },
  { label: '↓', data: '\x1b[B', hint: 'Down' },
  { label: '←', data: '\x1b[D', hint: 'Left' },
  { label: '→', data: '\x1b[C', hint: 'Right' },
  { label: '^C', data: '\x03', hint: 'Control C' },
  { label: '⏎', data: '\r', hint: 'Enter' },
  { label: '⇧⏎', data: '\x1b[13;2u', hint: 'Shift Enter' },
];

/** The special keys, then a line to type a message and send it with Enter. */
export function KeyBar({ send, placeholder = 'Message…' }: { send: (data: string) => void; placeholder?: string }) {
  const [text, setText] = useState('');
  const submit = () => {
    if (!text) return;
    send(text);
    // Enter on its own, a moment later: a TUI can read the text and the
    // Enter of one write as a paste and keep the Enter as a new line.
    setTimeout(() => send('\r'), 80);
    setText('');
  };
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keys} keyboardShouldPersistTaps="always">
        {KEYS.map((key) => (
          <Pressable key={key.label} onPress={() => send(key.data)} style={({ pressed }) => [styles.key, pressed && styles.pressed]} accessibilityLabel={key.hint} accessibilityRole="button">
            <Text style={styles.keyText}>{key.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          multiline
          autoCorrect
        />
        <Pressable onPress={submit} disabled={!text} style={[styles.send, !text && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Send">
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  keys: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs },
  key: { minWidth: 40, paddingHorizontal: spacing.sm, paddingVertical: 7, borderRadius: 6, backgroundColor: colors.raised, alignItems: 'center' },
  pressed: { backgroundColor: colors.border },
  keyText: { color: colors.text, fontSize: 14, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  input: {
    flex: 1,
    maxHeight: 120,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 15,
  },
  send: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: 9 },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
