import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { act } from '@/projects/queries';
import { request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type Listing = { path: string; parent: string | null; folders: { name: string; path: string }[]; error?: string };

/**
 * Pick a folder on the computer to attach to a project, one level at a time
 * (list-folders), in place or as a new git worktree.
 */
export default function FolderPickerScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const insets = useSafeAreaInsets();
  const online = useConnection((s) => s.status.state === 'online');
  const [path, setPath] = useState<string | null>(null);
  const [worktree, setWorktree] = useState(false);
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const listing = useQuery({
    queryKey: ['folders', path],
    queryFn: () => request<Listing>('list-folders', path ? [path] : []),
    enabled: online,
  });
  const here = listing.data?.path;

  const attach = async () => {
    if (!here) return;
    setBusy(true);
    try {
      await act('attach-project-folder', [projectId, worktree ? { path: here, mode: 'worktree', ...(branch.trim() ? { branch: branch.trim() } : {}) } : { path: here }]);
      router.back();
    } catch (err: any) {
      Alert.alert('Could not attach the folder', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: here ? here.split('/').filter(Boolean).pop() || '/' : 'Choose a folder' }} />
      <Text style={styles.path} numberOfLines={2}>{here || ' '}</Text>
      {listing.data?.error ? <Text style={styles.error}>{listing.data.error}</Text> : null}
      <FlatList
        data={[...(listing.data?.parent ? [{ name: '..', path: listing.data.parent }] : []), ...(listing.data?.folders || [])]}
        keyExtractor={(item) => item.path}
        renderItem={({ item }) => (
          <Pressable onPress={() => setPath(item.path)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
            <Ionicons name={item.name === '..' ? 'arrow-up' : 'folder-outline'} size={18} color={colors.textDim} />
            <Text style={styles.name} numberOfLines={1}>{item.name === '..' ? 'Up' : item.name}</Text>
          </Pressable>
        )}
        ListEmptyComponent={listing.isLoading ? <ActivityIndicator style={{ margin: spacing.lg }} color={colors.accent} /> : <Text style={styles.empty}>No folders inside.</Text>}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.modes}>
          {[{ key: false, label: 'In place' }, { key: true, label: 'New worktree' }].map((mode) => (
            <Pressable key={mode.label} onPress={() => setWorktree(mode.key)} style={[styles.chip, worktree === mode.key && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: worktree === mode.key }}>
              <Text style={[styles.chipText, worktree === mode.key && styles.chipTextOn]}>{mode.label}</Text>
            </Pressable>
          ))}
        </View>
        {worktree ? (
          <TextInput value={branch} onChangeText={setBranch} placeholder="Branch (optional)" placeholderTextColor={colors.textFaint} style={styles.input} autoCapitalize="none" autoCorrect={false} />
        ) : null}
        <Pressable onPress={attach} disabled={!here || busy} style={[styles.button, (!here || busy) && { opacity: 0.5 }]} accessibilityRole="button">
          <Text style={styles.buttonText}>{busy ? 'Attaching…' : 'Attach this folder'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  path: { color: colors.textDim, fontSize: 12, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontFamily: 'Menlo' },
  error: { color: colors.danger, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  pressed: { backgroundColor: colors.surface },
  name: { color: colors.text, fontSize: 15, flex: 1 },
  empty: { color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surface },
  modes: { flexDirection: 'row', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  chipOn: { borderColor: colors.accent, backgroundColor: 'rgba(128,136,255,0.15)' },
  chipText: { color: colors.textDim, fontSize: 13 },
  chipTextOn: { color: colors.text },
  input: { color: colors.text, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: spacing.md, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
