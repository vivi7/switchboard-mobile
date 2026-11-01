import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { fieldsBehindMore, fieldsFor, type Field } from '@/shared/vendor/session-config';
import { colors, spacing } from '@/theme';

export type Options = Record<string, unknown>;

// Choices use '' or null for "Default"; an unset value means the same.
const normal = (value: unknown) => (value === '' || value === undefined ? null : value);

/**
 * The launch options for one CLI, from the same field list the desktop's
 * form uses (public/session-config.js). Optional fields wait behind "More
 * options" until they have a value, as on the desktop.
 */
export function OptionsForm({ runtime, values, onChange }: { runtime: string; values: Options; onChange: (values: Options) => void }) {
  const [showMore, setShowMore] = useState(false);
  const fields = fieldsFor(runtime).filter((f) => !f.hidden);
  const behindMore = new Set(fieldsBehindMore(runtime, values));
  const visible = fields.filter((f) => showMore || !behindMore.has(f.key));
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <View style={styles.form}>
      {visible.map((field) => <FieldRow key={field.key} field={field} value={values[field.key]} onChange={(v) => set(field.key, v)} />)}
      {behindMore.size > 0 ? (
        <Pressable onPress={() => setShowMore(!showMore)} accessibilityRole="button">
          <Text style={styles.more}>{showMore ? 'Fewer options' : 'More options'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FieldRow({ field, value, onChange }: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  if (field.type === 'boolean') {
    return (
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.label}>{field.label}</Text>
          {field.description ? <Text style={styles.description}>{field.description}</Text> : null}
        </View>
        <Switch value={value === true} onValueChange={onChange} trackColor={{ true: colors.accent }} />
      </View>
    );
  }
  if (field.type === 'select' || field.type === 'permission') {
    const current = normal(value === undefined ? field.default : value);
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{field.label}</Text>
        <View style={styles.choices}>
          {(field.choices || []).map((choice) => {
            const selected = normal(choice.value) === current;
            return (
              <Pressable key={String(choice.value)} onPress={() => onChange(choice.value)} style={[styles.choice, selected && styles.choiceOn]} accessibilityRole="radio" accessibilityState={{ selected }}>
                <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {field.description ? <Text style={styles.description}>{field.description}</Text> : null}
      </View>
    );
  }
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{field.label}</Text>
      <TextInput
        value={typeof value === 'string' ? value : ''}
        onChangeText={onChange}
        placeholder={field.placeholder}
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={field.type === 'textarea'}
        style={[styles.input, field.type === 'textarea' && styles.textarea]}
      />
      {field.suggestions?.length ? (
        <View style={styles.choices}>
          {field.suggestions.map((s) => (
            <Pressable key={s} onPress={() => onChange(s)} style={[styles.choice, value === s && styles.choiceOn]}>
              <Text style={[styles.choiceText, value === s && styles.choiceTextOn]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {field.description ? <Text style={styles.description}>{field.description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  field: { gap: 6 },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  description: { color: colors.textFaint, fontSize: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  choiceOn: { backgroundColor: 'rgba(128,136,255,0.18)', borderColor: colors.accent },
  choiceText: { color: colors.textDim, fontSize: 13 },
  choiceTextOn: { color: colors.text },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 15 },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  more: { color: colors.accent, fontSize: 14, paddingVertical: spacing.xs },
});
