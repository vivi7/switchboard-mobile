import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { request, useConnection } from '@/store/connection';
import { colors, spacing } from '@/theme';

type Entry = { name: string; relativePath: string; type: 'directory' | 'file' | 'other'; size: number; viewable: boolean; previewType: string | null };

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  directory: 'folder-outline', image: 'image-outline', pdf: 'document-outline', text: 'document-text-outline', html: 'code-slash-outline',
};

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A folder of a project on the computer (list-project-directory): folders first, then files. */
export default function FilesScreen() {
  const { root, path = '', title } = useLocalSearchParams<{ root: string; path?: string; title?: string }>();
  const online = useConnection((s) => s.status.state === 'online');
  const listing = useQuery({
    queryKey: ['directory', root, path],
    queryFn: () => request<{ ok: boolean; entries?: Entry[]; error?: string }>('list-project-directory', [root, path]),
    enabled: online && !!root,
  });

  const open = (entry: Entry) => {
    if (entry.type === 'directory') router.push({ pathname: '/files', params: { root, path: entry.relativePath, title } });
    else if (entry.viewable) router.push({ pathname: '/file', params: { root, path: entry.relativePath } });
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: path ? path.split('/').pop() : title || 'Files' }} />
      {listing.data?.error ? <Text style={styles.error}>{listing.data.error}</Text> : null}
      <FlatList
        data={listing.data?.entries || []}
        keyExtractor={(entry) => entry.relativePath}
        refreshControl={<RefreshControl refreshing={listing.isRefetching} onRefresh={() => { listing.refetch(); }} tintColor={colors.accent} />}
        renderItem={({ item }) => {
          const dim = item.type !== 'directory' && !item.viewable;
          return (
            <Pressable onPress={() => open(item)} disabled={dim} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
              <Ionicons name={ICONS[item.type === 'directory' ? 'directory' : item.previewType || ''] || 'document-outline'} size={18} color={dim ? colors.textFaint : colors.textDim} />
              <Text style={[styles.name, dim && { color: colors.textFaint }]} numberOfLines={1}>{item.name}</Text>
              {item.type === 'file' ? <Text style={styles.size}>{size(item.size)}</Text> : <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={listing.isLoading ? <ActivityIndicator style={{ margin: spacing.lg }} color={colors.accent} /> : <Text style={styles.empty}>This folder is empty.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  error: { color: colors.danger, padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  pressed: { backgroundColor: colors.surface },
  name: { color: colors.text, fontSize: 15, flex: 1 },
  size: { color: colors.textFaint, fontSize: 12 },
  empty: { color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl },
});
