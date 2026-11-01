import { create } from 'zustand';

import { pairWithDesktop, RemoteClient, type ConnectionStatus } from '@/remote/client';
import { queryClient } from '@/remote/query';
import type { PairingPayload } from '@/remote/pairing';
import { applyLiveEvent, type LiveState } from '@/sessions/model';
import { desktopFromPairing, keyPairOf, linkOf, loadActiveDesktop, removeDesktop, saveDesktop, type SavedDesktop } from './desktops';

// The paired computer, the connection to it, and the live state of its
// sessions. Screens read this store; desktop events update it and refresh
// the query cache.

type ConnectionStore = {
  loaded: boolean;
  desktop: SavedDesktop | null;
  status: ConnectionStatus;
  live: Record<string, LiveState>;
  /** The session open on screen, so it is not announced as needing you. */
  viewing: string | null;
  setViewing(sessionId: string | null): void;
  /** Read every live session's state again. */
  refreshLive(): Promise<void>;
  /** Load the saved computer and connect to it. */
  init(): Promise<void>;
  /** Pair with the computer in a scanned QR code, then connect to it. */
  pair(payload: PairingPayload, deviceName: string): Promise<void>;
  /** Forget the computer on this phone. */
  forget(): Promise<void>;
  /** Reconnect now instead of waiting for the next retry. */
  reconnect(): void;
};

let client: RemoteClient | null = null;

type DesktopEventListener = (event: string, args: any[]) => void;
const eventListeners = new Set<DesktopEventListener>();

/** Hear every event from the computer (terminal output, state changes). Returns the unsubscribe. */
export function onDesktopEvent(listener: DesktopEventListener): () => void {
  eventListeners.add(listener);
  return () => { eventListeners.delete(listener); };
}

/** Call the computer. Rejects when not connected. */
export function request<T = any>(method: string, params: unknown[] = []): Promise<T> {
  if (!client) return Promise.reject(new Error('No computer is paired'));
  return client.request<T>(method, params);
}

export const useConnection = create<ConnectionStore>((set, get) => {
  async function refreshLive() {
    try {
      const states = await request<any[]>('get-session-states');
      const live: Record<string, LiveState> = {};
      for (const s of states) live[s.sessionId] = { busy: s.busy, attention: s.attention, exited: s.exited, starting: s.starting };
      set({ live });
    } catch {}
  }

  function connect(desktop: SavedDesktop) {
    client?.stop();
    client = new RemoteClient({
      link: linkOf(desktop),
      device: keyPairOf(desktop),
      onStatus: (status) => {
        set({ status });
        if (status.state === 'online') {
          // Everything may have changed while offline.
          refreshLive();
          queryClient.invalidateQueries();
          if (status.address !== get().desktop?.lastAddress) {
            const updated = { ...desktop, lastAddress: status.address };
            set({ desktop: updated });
            saveDesktop(updated);
          }
        }
      },
      onEvent: (event, args) => {
        for (const listener of eventListeners) {
          try { listener(event, args); } catch {}
        }
        if (event === 'projects-changed') {
          queryClient.invalidateQueries({ queryKey: ['projects'] });
          // A session just started sends nothing else until it works.
          refreshLive();
          if (args[0] === 'project') queryClient.invalidateQueries({ queryKey: ['project-tree'] });
          return;
        }
        if (event === 'process-exited' || event === 'session-detected' || event === 'session-forked') {
          queryClient.invalidateQueries({ queryKey: ['projects'] });
        }
        const live = applyLiveEvent(get().live, event, args);
        if (live !== get().live) set({ live });
      },
    });
    client.start();
  }

  return {
    loaded: false,
    desktop: null,
    status: { state: 'closed' },
    live: {},
    viewing: null,
    setViewing: (sessionId) => set({ viewing: sessionId }),
    refreshLive,

    async init() {
      const desktop = await loadActiveDesktop();
      set({ desktop, loaded: true });
      if (desktop) connect(desktop);
    },

    async pair(payload, deviceName) {
      const link = { addresses: payload.addresses, port: payload.port, desktopKey: payload.desktopKey };
      const { device, hello, address } = await pairWithDesktop(link, payload.code, deviceName);
      const desktop = desktopFromPairing(payload, device, hello, address);
      await saveDesktop(desktop, { makeActive: true });
      set({ desktop, live: {} });
      queryClient.clear();
      connect(desktop);
    },

    async forget() {
      const desktop = get().desktop;
      client?.stop();
      client = null;
      if (desktop) await removeDesktop(desktop.deviceId);
      queryClient.clear();
      set({ desktop: null, status: { state: 'closed' }, live: {} });
    },

    reconnect() {
      if (client && get().status.state === 'offline') client.start();
    },
  };
});
