import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { launchTarget, type Project } from '@/projects/model';
import { request, useConnection } from '@/store/connection';
import { Sheet, type SheetOption } from '../Sheet';

type Harness = { id: string; label: string; enabled: boolean };

/** What to start and why: a phase, an item or a todo of the project's plan. */
export type StartRequest = { title: string; prompt: string; planItem: { file: 'plan' | 'todos'; itemText: string } };

/**
 * Start a session on part of the plan, in the project or one of its tracks,
 * with any CLI the computer has, the way the desktop's "Start a session on
 * this" menu does.
 */
export function StartSheet({ project, start, onClose }: { project: Project; start: StartRequest | null; onClose: () => void }) {
  const online = useConnection((s) => s.status.state === 'online');
  const refreshLive = useConnection((s) => s.refreshLive);
  const harnesses = useQuery({ queryKey: ['harnesses'], queryFn: () => request<Harness[]>('get-harnesses'), enabled: online });
  const clis = (harnesses.data || []).filter((h) => h.enabled);

  const launch = async (trackId: string | null, runtime: string) => {
    if (!start) return;
    const track = project.tracks.find((t) => t.id === trackId) || null;
    try {
      const result = await request<{ sessionId?: string; error?: string }>('launch-session', [{
        mode: 'new', ...launchTarget(project, track), runtime, initialPrompt: start.prompt, planItem: start.planItem,
      }]);
      if (result.error || !result.sessionId) throw new Error(result.error || 'Could not start the session');
      await refreshLive();
      router.push({ pathname: '/session/[id]', params: { id: result.sessionId, tab: 'terminal' } });
    } catch (err: any) {
      Alert.alert('Could not start the session', err.message);
    }
  };

  const places = [{ id: null as string | null, name: project.name }, ...project.tracks.filter((t) => t.status !== 'done').map((t) => ({ id: t.id as string | null, name: t.name, cli: t.cli }))];
  const options: SheetOption[] = [];
  for (const place of places) {
    for (const cli of clis.length ? clis : [{ id: 'claude', label: 'Claude' }]) {
      options.push({ label: `${cli.label} in ${place.name}`, hint: place.id ? 'track' : 'project', onPress: () => launch(place.id, cli.id) });
    }
  }
  return <Sheet visible={!!start} title={start ? `Start a session on “${start.title}”` : ''} options={options} onClose={onClose} />;
}
