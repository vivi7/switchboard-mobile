import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';

import { queryClient } from '@/remote/query';
import { cleanDisplayName, sessionState, sessionTitle, type Session } from '@/sessions/model';
import { request, useConnection } from '@/store/connection';
import { Sheet, type SheetOption } from './Sheet';
import { TextPrompt } from './TextPrompt';

type Track = { id: string; name: string; status?: string };
type ProjectNode = { id: string; name: string; status?: string; tracks?: Track[] };

async function run(action: Promise<unknown>) {
  try {
    const result: any = await action;
    if (result && typeof result === 'object' && result.error) throw new Error(result.error);
  } catch (err: any) {
    Alert.alert('That did not work', err?.message || String(err));
  } finally {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  }
}

/** The actions for one session, from a long press on its row. */
export function SessionActions({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const live = useConnection((s) => (session ? s.live[session.sessionId] : undefined));
  const unread = useConnection((s) => !!session && s.notices.ready.has(session.sessionId));
  const [renaming, setRenaming] = useState<Session | null>(null);
  const [moving, setMoving] = useState<Session | null>(null);
  const running = sessionState(live) !== 'idle';

  const options: SheetOption[] = [];
  if (session) {
    const id = session.sessionId;
    options.push({ label: 'Rename…', onPress: () => setRenaming(session) });
    options.push({ label: session.starred ? 'Unpin' : 'Pin', onPress: () => run(request('toggle-star', [id])) });
    if (session.type !== 'terminal') options.push({ label: 'Move to project…', onPress: () => setMoving(session) });
    // The desktop answers with its new marks (session-notices-changed).
    if (session.type !== 'terminal') options.push({ label: unread ? 'Mark as read' : 'Mark as unread', onPress: () => run(request(unread ? 'mark-read' : 'mark-unread', [id])) });
    if (running) {
      options.push({
        label: 'Stop', destructive: true,
        onPress: () => Alert.alert('Stop this session?', sessionTitle(session), [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Stop', style: 'destructive', onPress: () => run(request('stop-session', [id])) },
        ]),
      });
    }
    if (session.type !== 'terminal') {
      options.push({
        label: session.archived ? 'Unarchive' : 'Archive',
        hint: running && !session.archived ? 'stops it first' : undefined,
        onPress: () => run((async () => {
          // Archiving a live session stops it first, as on the desktop.
          if (!session.archived && running) await request('stop-session', [id]);
          return request('archive-session', [id, session.archived ? 0 : 1]);
        })()),
      });
    }
  }

  const fallback = renaming ? cleanDisplayName(renaming.aiTitle || renaming.summary) : '';
  return (
    <>
      <Sheet visible={!!session} title={session ? sessionTitle(session) : ''} options={options} onClose={onClose} />
      <TextPrompt
        visible={!!renaming}
        title="Rename session"
        initialValue={renaming ? sessionTitle(renaming) : ''}
        confirm="Rename"
        onClose={() => setRenaming(null)}
        onSubmit={(name) => {
          if (!renaming || !name || name === sessionTitle(renaming)) return;
          // Typing the session's own title back clears the custom name, as on the desktop.
          run(request('rename-session', [renaming.sessionId, name === fallback ? null : name]));
        }}
      />
      <MovePicker session={moving} onClose={() => setMoving(null)} />
    </>
  );
}

function MovePicker({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const tree = useQuery({
    queryKey: ['project-tree'],
    queryFn: () => request<{ projects: ProjectNode[] }>('get-project-tree', [false]),
    enabled: !!session,
  });
  const options: SheetOption[] = [];
  if (session) {
    const move = (projectId: string | null, trackId: string | null) => run(request('set-session-assignment', [session.sessionId, projectId, trackId]));
    for (const project of (tree.data?.projects || []).filter((p) => p.status !== 'done')) {
      const here = session.projectId === project.id && !session.trackId;
      options.push({ label: project.name, hint: here ? 'current' : undefined, onPress: () => move(project.id, null) });
      for (const track of (project.tracks || []).filter((t) => t.status !== 'done')) {
        const current = session.trackId === track.id;
        options.push({ label: `${project.name} › ${track.name}`, hint: current ? 'current' : undefined, onPress: () => move(project.id, track.id) });
      }
    }
    if (session.projectId) options.push({ label: 'Remove from its project', hint: 'stays in the Sessions list', destructive: true, onPress: () => move(null, null) });
  }
  return (
    <Sheet
      visible={!!session}
      title={tree.isLoading ? 'Loading projects…' : options.length ? 'Move to' : 'No projects on this computer yet'}
      options={options}
      onClose={onClose}
    />
  );
}
