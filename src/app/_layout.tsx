import '@/remote/random';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { AttentionToast } from '@/components/AttentionToast';
import { queryClient } from '@/remote/query';
import { useConnection } from '@/store/connection';
import { colors } from '@/theme';

export default function RootLayout() {
  useEffect(() => {
    useConnection.getState().init();
    // iOS drops the socket in the background; reconnect as soon as the app is back.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') useConnection.getState().reconnect();
      useConnection.getState().setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Back' }} />
        <Stack.Screen name="pair" options={{ title: 'Pair with a computer' }} />
        <Stack.Screen name="settings" options={{ title: 'Computer' }} />
        <Stack.Screen name="new" options={{ title: 'New session' }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
        <Stack.Screen name="project/[id]" options={{ title: 'Project' }} />
        <Stack.Screen name="folders" options={{ title: 'Choose a folder' }} />
        <Stack.Screen name="files" options={{ title: 'Files' }} />
        <Stack.Screen name="file" options={{ title: 'File' }} />
        <Stack.Screen name="schedule" options={{ title: 'Schedule' }} />
      </Stack>
      <AttentionToast />
    </QueryClientProvider>
  );
}
