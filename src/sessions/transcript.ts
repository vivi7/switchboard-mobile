// A session's conversation as chat items, from the transcript entries the
// desktop returns (read-session-entries: Claude's format, Codex mapped onto it
// by the desktop). Built up as new entries arrive, the way the desktop's
// message viewer (public/jsonl-viewer.js) pairs each tool call with its result.

export type ChatItem =
  | { kind: 'user'; id: string; text: string; time?: string }
  | { kind: 'assistant'; id: string; text: string; time?: string }
  | { kind: 'command'; id: string; text: string; output?: string; time?: string }
  | { kind: 'tool'; id: string; name: string; summary: string; result?: string; error?: boolean; time?: string };

const MAX_RESULT = 2000;

/** Terminal colour and cursor codes, which a CLI leaves in command output. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

/** Text without the wrappers Claude Code adds for itself. */
export function cleanText(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9_-]*(?:\s[^>]*)?\/?>/g, '')
    .trim();
}

function blocksOf(content: any): any[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

function resultText(content: any): string {
  const text = typeof content === 'string'
    ? content
    : blocksOf(content).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
  const clean = stripAnsi(text);
  return clean.length > MAX_RESULT ? `${clean.slice(0, MAX_RESULT)}…` : clean;
}

/** One line saying what a tool call does. */
export function toolSummary(name: string, input: any): string {
  if (!input || typeof input !== 'object') return '';
  const pick = input.command ?? input.file_path ?? input.pattern ?? input.path ?? input.url ?? input.query ?? input.description ?? input.prompt;
  const text = typeof pick === 'string'
    ? pick
    : String(Object.values(input).find((v) => typeof v === 'string') ?? '');
  const line = text.split('\n')[0];
  return line.length > 160 ? `${line.slice(0, 160)}…` : line;
}

/** A slash command as Claude Code records it: <command-name>/x</command-name><command-args>…</command-args>. */
function slashCommand(text: string): string | null {
  const name = /<command-name>([\s\S]*?)<\/command-name>/.exec(text)?.[1]?.trim();
  if (!name) return null;
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim();
  return args ? `${name} ${args}` : name;
}

export class Transcript {
  items: ChatItem[] = [];
  private toolIndex = new Map<string, number>();

  /** Add the entries read since the last call; returns the items, as a new array if anything changed. */
  add(entries: any[]): ChatItem[] {
    let changed = false;
    for (const entry of entries) {
      if (this.addEntry(entry)) changed = true;
    }
    if (changed) this.items = [...this.items];
    return this.items;
  }

  private push(item: ChatItem) {
    this.items.push(item);
    return true;
  }

  private addEntry(entry: any): boolean {
    if (!entry || (entry.type !== 'user' && entry.type !== 'assistant') || entry.isMeta) return false;
    const time = entry.timestamp;
    const baseId = entry.uuid || `${this.items.length}`;
    let changed = false;
    blocksOf(entry.message?.content).forEach((block, i) => {
      const id = `${baseId}:${i}`;
      if (block?.type === 'text' && typeof block.text === 'string') {
        if (entry.type === 'user') {
          const command = slashCommand(block.text);
          if (command) { changed = this.push({ kind: 'command', id, text: command, time }) || changed; return; }
          const output = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/.exec(block.text)?.[1];
          if (output !== undefined) {
            const last = this.items.at(-1);
            if (last?.kind === 'command' && last.output === undefined) { last.output = stripAnsi(output).trim(); changed = true; }
            return;
          }
        }
        const text = cleanText(block.text);
        if (text) changed = this.push({ kind: entry.type, id, text, time }) || changed;
      } else if (block?.type === 'tool_use') {
        this.toolIndex.set(block.id, this.items.length);
        changed = this.push({ kind: 'tool', id: block.id || id, name: block.name || 'Tool', summary: toolSummary(block.name, block.input), time }) || changed;
      } else if (block?.type === 'tool_result') {
        const index = this.toolIndex.get(block.tool_use_id);
        if (index === undefined) return;
        const tool = this.items[index] as Extract<ChatItem, { kind: 'tool' }>;
        this.items[index] = { ...tool, result: resultText(block.content), error: !!block.is_error };
        changed = true;
      } else if (block?.type === 'image') {
        changed = this.push({ kind: entry.type, id, text: '[image]', time }) || changed;
      }
    });
    return changed;
  }
}
