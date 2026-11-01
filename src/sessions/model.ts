// The session list, as the desktop's Sessions tab builds it (public/sidebar.js
// and public/utils.js in switchboard): sessions grouped by the folder they
// run in, newest first, with each session's live state.

/** A session as get-projects returns it. */
export type Session = {
  sessionId: string;
  summary?: string | null;
  firstPrompt?: string | null;
  name?: string | null;
  aiTitle?: string | null;
  created?: string | null;
  modified?: string | null;
  messageCount?: number;
  projectPath: string;
  runtime?: string | null;
  type?: string;
  starred?: number;
  archived?: number;
  projectId?: string | null;
  trackId?: string | null;
};

/** A folder as get-projects returns it. */
export type Folder = { folder: string; projectPath: string; sessions: Session[] };

/** A live PTY, from get-session-states and the events that follow. */
export type LiveState = { busy: boolean; attention: boolean; exited: boolean; starting: boolean };

export type SessionFilter = 'all' | 'running' | 'starred' | 'today';

export type SessionState = 'attention' | 'busy' | 'running' | 'idle';

/**
 * Unread and needs-you marks, as the desktop window keeps them: a session that
 * finished, or asked for something, while nobody was looking. Opening it on
 * the desktop or on a phone clears them.
 */
export type Notices = { ready: Set<string>; attention: Set<string> };

/** What a row shows: the live states, plus finished and not yet read. */
export type RowState = SessionState | 'unread';

/** Same cleanup as the desktop's cleanDisplayName. */
export function cleanDisplayName(name: string | null | undefined): string {
  if (!name) return '';
  let text = name;
  const prefix = 'Implement the following plan:';
  if (text.startsWith(prefix)) text = text.slice(prefix.length).trim();
  text = text.replace(/<\/?[a-zA-Z][a-zA-Z0-9_-]*(?:\s[^>]*)?\/?>/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

/** Name, then the CLI's title, then the summary, as the desktop shows it. */
export function sessionTitle(session: Session): string {
  if (session.type === 'terminal') return cleanDisplayName(session.name) || 'Terminal';
  return cleanDisplayName(session.name || session.aiTitle || session.summary) || 'New session';
}

/** The last two parts of a path: "Switchboard/contributions". */
export function shortProjectPath(projectPath: string): string {
  return projectPath.split(/[\\/]/).filter(Boolean).slice(-2).join('/');
}

export function cliLabel(session: Session): string {
  if (session.type === 'terminal') return 'Terminal';
  return session.runtime === 'codex' ? 'Codex' : 'Claude';
}

function sessionTime(session: Session): number {
  const time = Date.parse(session.modified || session.created || '');
  return Number.isNaN(time) ? 0 : time;
}

/** "just now", "5m ago", "3h ago", "2d ago", then the date. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  const time = Date.parse(iso || '');
  if (Number.isNaN(time)) return '';
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(time);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

/** What a row shows: waiting for you first, then working, then just running. */
export function sessionState(live: LiveState | undefined): SessionState {
  if (!live || live.exited) return 'idle';
  if (live.attention) return 'attention';
  if (live.busy) return 'busy';
  return 'running';
}

/** The marks from get-session-notices or its event. */
export function noticesFrom(raw: unknown): Notices {
  const ids = (list: unknown) => new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
  const value = (raw && typeof raw === 'object' ? raw : {}) as { ready?: unknown; attention?: unknown };
  return { ready: ids(value.ready), attention: ids(value.attention) };
}

/** Needs-you first (live, or kept by the desktop), then working, then unread, as the desktop orders them. */
export function rowState(sessionId: string, live: LiveState | undefined, notices: Notices): RowState {
  const state = sessionState(live);
  if (state === 'attention' || notices.attention.has(sessionId)) return 'attention';
  if (state === 'busy') return 'busy';
  if (notices.ready.has(sessionId)) return 'unread';
  return state;
}

function isToday(session: Session, now: number): boolean {
  const time = sessionTime(session);
  return new Date(time).toDateString() === new Date(now).toDateString();
}

export type Section = { title: string; projectPath: string; data: Session[] };

/**
 * Folders with their sessions, newest first, after the filter and an
 * optional set of search matches. Empty folders are left out.
 */
export function buildSections(
  folders: Folder[],
  { filter = 'all', live = {}, matches = null, now = Date.now() }: { filter?: SessionFilter; live?: Record<string, LiveState>; matches?: Set<string> | null; now?: number } = {},
): Section[] {
  const keep = (session: Session) => {
    if (session.archived) return false;
    if (matches && !matches.has(session.sessionId)) return false;
    if (filter === 'running') return sessionState(live[session.sessionId]) !== 'idle';
    if (filter === 'starred') return !!session.starred;
    if (filter === 'today') return isToday(session, now);
    return true;
  };
  return folders
    .map((folder) => ({
      title: shortProjectPath(folder.projectPath),
      projectPath: folder.projectPath,
      data: folder.sessions.filter(keep).sort((a, b) => sessionTime(b) - sessionTime(a)),
    }))
    .filter((section) => section.data.length > 0)
    .sort((a, b) => sessionTime(b.data[0]) - sessionTime(a.data[0]));
}

/** Apply one event from the desktop to the live states. Returns a new map, or the same one if nothing changed. */
export function applyLiveEvent(live: Record<string, LiveState>, event: string, args: any[]): Record<string, LiveState> {
  const [id] = args;
  if (typeof id !== 'string') return live;
  const current = live[id] || { busy: false, attention: false, exited: false, starting: false };
  switch (event) {
    case 'cli-busy-state':
      // Working again means the question was answered.
      return { ...live, [id]: { ...current, exited: false, busy: !!args[1], attention: args[1] ? false : current.attention } };
    case 'terminal-notification':
      return args[2] === 'attention' ? { ...live, [id]: { ...current, attention: true } } : live;
    case 'process-exited':
      return { ...live, [id]: { ...current, exited: true, busy: false, attention: false } };
    case 'session-detected':
    case 'session-forked': {
      const [oldId, newId] = args;
      if (typeof newId !== 'string' || !live[oldId]) return live;
      const { [oldId]: moved, ...rest } = live;
      return { ...rest, [newId]: moved };
    }
    default:
      return live;
  }
}
