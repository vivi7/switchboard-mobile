import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { Transcript, type ChatItem } from '@/sessions/transcript';
import { onDesktopEvent, request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Follow a session's transcript: read it once, then only what was written
 * since, whenever the computer says sessions changed.
 */
function useTranscript(sessionId: string) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [error, setError] = useState('');
  const online = useConnection((s) => s.status.state === 'online');
  const transcript = useRef(new Transcript());
  const cursor = useRef(0);
  const reading = useRef(false);
  const again = useRef(false);

  // One read at a time; a change during a read is picked up by reading again.
  const read = useCallback(async () => {
    if (reading.current) { again.current = true; return; }
    reading.current = true;
    try {
      do {
        again.current = false;
        try {
          const result = await request<{ entries?: any[]; cursor?: number; reset?: boolean; error?: string }>('read-session-entries', [sessionId, cursor.current]);
          if (result.error) {
            // A session that has not written its transcript yet has none to read.
            setError(result.error === 'Session not found in cache' ? '' : result.error);
            continue;
          }
          if (result.reset) transcript.current = new Transcript();
          cursor.current = result.cursor ?? cursor.current;
          setItems(transcript.current.add(result.entries || []));
          setError('');
        } catch (err: any) {
          setError(err.message);
        }
      } while (again.current);
    } finally {
      reading.current = false;
    }
  }, [sessionId]);

  useEffect(() => { if (online) read(); }, [online, read]);
  useEffect(() => onDesktopEvent((event, args) => {
    if (event === 'projects-changed' || (event === 'cli-busy-state' && args[0] === sessionId && !args[1])) read();
  }), [read, sessionId]);

  return { items, error };
}

const ToolRow = memo(function ToolRow({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen(!open)} style={styles.tool} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <Text style={styles.toolLine} numberOfLines={open ? undefined : 1}>
        <Text style={[styles.toolName, item.error && { color: colors.danger }]}>{item.name}</Text>
        {item.summary ? <Text style={styles.toolSummary}>  {item.summary}</Text> : null}
      </Text>
      {open && item.result ? <Text style={styles.toolResult} selectable>{item.result}</Text> : null}
    </Pressable>
  );
});

const Row = memo(function Row({ item }: { item: ChatItem }) {
  if (item.kind === 'tool') return <ToolRow item={item} />;
  if (item.kind === 'command') {
    return (
      <View style={styles.command}>
        <Text style={styles.commandText}>{item.text}</Text>
        {item.output ? <Text style={styles.toolResult} selectable>{item.output}</Text> : null}
      </View>
    );
  }
  if (item.kind === 'user') {
    return (
      <View style={styles.userBubble}>
        <Text style={styles.userText} selectable>{item.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.assistant}>
      <Markdown style={markdownStyles}>{item.text}</Markdown>
    </View>
  );
});

/** The conversation, newest at the bottom. */
export function ChatView({ sessionId }: { sessionId: string }) {
  const { items, error } = useTranscript(sessionId);
  const data = [...items].reverse();
  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={data}
        inverted
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Row item={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
        initialNumToRender={20}
        windowSize={11}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.sm },
  error: { color: colors.attention, fontSize: 13, padding: spacing.md },
  // Inverted lists flip their content; flip the empty text back.
  empty: { color: colors.textFaint, textAlign: 'center', padding: spacing.xl, transform: [{ scaleY: -1 }] },
  userBubble: { alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: 'rgba(128,136,255,0.18)', borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  userText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  assistant: { alignSelf: 'stretch' },
  tool: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: 7 },
  toolLine: { color: colors.textDim, fontSize: 13 },
  toolName: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  toolSummary: { color: colors.textDim, fontFamily: mono, fontSize: 12 },
  toolResult: { color: colors.textDim, fontFamily: mono, fontSize: 12, marginTop: spacing.xs },
  command: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: 7 },
  commandText: { color: colors.textDim, fontFamily: mono, fontSize: 13 },
});

export const markdownStyles = StyleSheet.create({
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  // The body's line height would clip larger headings.
  heading1: { fontSize: 24, lineHeight: 30, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  heading2: { fontSize: 20, lineHeight: 26, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  heading3: { fontSize: 17, lineHeight: 24, fontWeight: '600', marginTop: 6, marginBottom: 2 },
  code_inline: { fontFamily: mono, backgroundColor: colors.surface, color: colors.text, borderRadius: 4 },
  fence: { fontFamily: mono, fontSize: 12, backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, borderRadius: 6 },
  code_block: { fontFamily: mono, fontSize: 12, backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, borderRadius: 6 },
  link: { color: colors.accent },
  blockquote: { backgroundColor: colors.surface, borderLeftColor: colors.border },
  hr: { backgroundColor: colors.border },
  table: { borderColor: colors.border },
  tr: { borderColor: colors.border },
});
