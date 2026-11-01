import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { markdownStyles } from '@/components/ChatView';
import { act } from '@/projects/queries';
import { request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type FileData = { ok: boolean; error?: string; previewType?: 'text' | 'html' | 'image' | 'pdf' | 'pptx'; content?: string; mimeType?: string; base64?: string };

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** A project file: text and Markdown to read or edit, images to look at. */
export default function FileScreen() {
  const { root, path } = useLocalSearchParams<{ root: string; path: string }>();
  const online = useConnection((s) => s.status.state === 'online');
  const file = useQuery({
    queryKey: ['file', root, path],
    queryFn: () => request<FileData>('read-project-file', [root, path]),
    enabled: online && !!root && !!path,
  });
  const [raw, setRaw] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const name = (path || '').split('/').pop() || 'File';
  const data = file.data;
  const isText = data?.previewType === 'text' || data?.previewType === 'html';
  const isMarkdown = /\.(md|markdown)$/i.test(name);

  const save = async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      await act('save-project-file', [root, path, draft]);
      await file.refetch();
      setDraft(null);
    } catch (err: any) {
      Alert.alert('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  };

  const header = () => {
    if (!isText) return null;
    if (draft !== null) {
      return (
        <View style={styles.headerButtons}>
          <Pressable onPress={() => setDraft(null)} hitSlop={10}><Text style={styles.headerButtonDim}>Cancel</Text></Pressable>
          <Pressable onPress={save} disabled={saving} hitSlop={10}><Text style={styles.headerButton}>{saving ? 'Saving…' : 'Save'}</Text></Pressable>
        </View>
      );
    }
    return (
      <View style={styles.headerButtons}>
        {isMarkdown ? <Pressable onPress={() => setRaw((r) => !r)} hitSlop={10}><Text style={styles.headerButtonDim}>{raw ? 'Formatted' : 'Raw'}</Text></Pressable> : null}
        <Pressable onPress={() => setDraft(data?.content ?? '')} hitSlop={10}><Text style={styles.headerButton}>Edit</Text></Pressable>
      </View>
    );
  };

  let body;
  if (file.isLoading) body = <ActivityIndicator style={{ margin: spacing.xl }} color={colors.accent} />;
  else if (!data?.ok) body = <Text style={styles.error}>{data?.error || 'Could not open the file.'}</Text>;
  else if (draft !== null) {
    body = (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        multiline
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
        style={styles.editor}
      />
    );
  } else if (data.previewType === 'image' && data.base64) {
    body = <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={styles.imageBox}><Image source={{ uri: `data:${data.mimeType};base64,${data.base64}` }} style={styles.image} resizeMode="contain" /></ScrollView>;
  } else if (isText) {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        {isMarkdown && !raw ? <Markdown style={markdownStyles}>{data.content || ''}</Markdown> : (
          <ScrollView horizontal><Text style={styles.code} selectable>{data.content}</Text></ScrollView>
        )}
      </ScrollView>
    );
  } else {
    body = <Text style={styles.error}>This kind of file opens on the computer only.</Text>;
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <Stack.Screen options={{ title: name, headerRight: header }} />
      {body}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerButtons: { flexDirection: 'row', gap: spacing.lg, paddingHorizontal: spacing.sm },
  headerButton: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  headerButtonDim: { color: colors.textDim, fontSize: 16 },
  content: { padding: spacing.lg },
  code: { color: colors.text, fontFamily: mono, fontSize: 12, lineHeight: 18 },
  editor: { flex: 1, color: colors.text, fontFamily: mono, fontSize: 13, lineHeight: 19, padding: spacing.lg },
  imageBox: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 1 },
  error: { color: colors.textDim, padding: spacing.lg },
});
