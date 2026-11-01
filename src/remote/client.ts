import nacl from 'tweetnacl';

import { createRemoteProtocol, type Channel, type KeyPair } from '@/shared/vendor/remote-protocol';

// The connection to Switchboard on a computer: a handshake, then encrypted
// requests, replies and events over one WebSocket (see remote-protocol.js
// and remote-server.js in switchboard). Nothing here needs React Native, so
// the tests run it in Node.

const protocol = createRemoteProtocol(nacl);

/** Where to reach a computer, and the key it proved in the pairing QR code. */
export type DesktopLink = { addresses: string[]; port: number; desktopKey: Uint8Array };

export type Hello = {
  v: number;
  appVersion: string;
  desktop: string;
  device: { id: string; name: string };
  methods: string[];
};

export type RejectReason = 'unknown-device' | 'revoked' | 'pairing-failed' | 'protocol';

export type ConnectionStatus =
  | { state: 'connecting' }
  | { state: 'online'; address: string; hello: Hello }
  | { state: 'offline'; retryInMs: number; error: string }
  | { state: 'rejected'; reason: RejectReason; message: string }
  | { state: 'closed' };

// Close codes from remote-server.js.
const REJECTIONS: Record<number, RejectReason> = { 4002: 'protocol', 4003: 'unknown-device', 4004: 'revoked', 4005: 'pairing-failed' };

export class RejectedError extends Error {
  constructor(readonly reason: RejectReason, message: string) {
    super(message);
  }
}

type WebSocketLike = {
  binaryType: string;
  readyState: number;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: any) => void) | null;
  onmessage: ((event: { data: any }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: any) => void) | null;
};
export type WebSocketFactory = (url: string) => WebSocketLike;

const defaultFactory: WebSocketFactory = (url) => new WebSocket(url) as unknown as WebSocketLike;

type Connection = { ws: WebSocketLike; channel: Channel; hello: Hello; address: string };

type ConnectOptions = {
  device: KeyPair;
  mode?: 'auth' | 'pair';
  pairingCode?: Uint8Array;
  deviceName?: string;
  connectTimeoutMs?: number;
  socketFactory?: WebSocketFactory;
  onMessage?: (message: any) => void;
  onClose?: (code: number, reason: string) => void;
};

function rejectionMessage(reason: RejectReason, serverReason: string): string {
  switch (reason) {
    case 'revoked': return 'This phone was removed on the computer. Pair it again.';
    case 'unknown-device': return 'The computer does not know this phone any more. Pair it again.';
    case 'pairing-failed': return serverReason === 'Pairing is not open'
      ? 'The pairing code is no longer valid. Show a new one on the computer.'
      : `Pairing failed: ${serverReason || 'the code was not accepted'}.`;
    default: return serverReason || 'The computer closed the connection.';
  }
}

/** Connect to one address: handshake, then hand back the open connection. */
function connectAddress(link: DesktopLink, address: string, options: ConnectOptions): Promise<Connection> {
  const { device, mode = 'auth', pairingCode, deviceName = '', connectTimeoutMs = 4000, socketFactory = defaultFactory } = options;
  return new Promise((resolve, reject) => {
    const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
    const ws = socketFactory(`ws://${host}:${link.port}/remote`);
    ws.binaryType = 'arraybuffer';
    let settled = false;
    // Only an established connection reports its close; a failed attempt
    // closes its own socket and must not look like a dropped connection.
    let established = false;
    let state: ReturnType<typeof protocol.phoneHello>['state'] | null = null;
    let channel: Channel | null = null;
    const finish = (error: Error | null, connection?: Connection) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        try { ws.close(); } catch {}
        reject(error);
      } else {
        established = true;
        resolve(connection!);
      }
    };
    const timer = setTimeout(() => finish(new Error(`No answer from ${address}`)), connectTimeoutMs);

    ws.onopen = () => {
      const hello = protocol.phoneHello(device, { mode, name: deviceName });
      state = hello.state;
      ws.send(JSON.stringify(hello.message));
    };
    ws.onmessage = ({ data }) => {
      try {
        if (typeof data === 'string') {
          const answer = protocol.phoneAnswer(JSON.parse(data), state!, device, link.desktopKey, pairingCode ?? null);
          channel = answer.channel;
          ws.send(JSON.stringify(answer.message));
          return;
        }
        if (!channel) throw new Error('Encrypted frame before the handshake');
        const message = channel.open(new Uint8Array(data));
        if (!settled && message.event === 'remote-access-hello') {
          finish(null, { ws, channel, hello: message.args[0], address });
          return;
        }
        options.onMessage?.(message);
      } catch (err: any) {
        if (!settled) finish(new RejectedError('protocol', err?.message || 'Handshake failed'));
        else try { ws.close(4002, 'Protocol error'); } catch {}
      }
    };
    ws.onerror = () => finish(new Error(`Could not reach ${address}`));
    ws.onclose = ({ code, reason }) => {
      if (!settled) {
        const rejection = REJECTIONS[code];
        finish(rejection ? new RejectedError(rejection, rejectionMessage(rejection, reason)) : new Error(`Could not reach ${address}`));
        return;
      }
      if (established) options.onClose?.(code, reason);
    };
  });
}

/**
 * Try every address, best first. A rejection (revoked, unknown, bad code)
 * stops at once: another address leads to the same computer.
 */
export async function connectToDesktop(link: DesktopLink, options: ConnectOptions & { preferAddress?: string }): Promise<Connection> {
  const ordered = options.preferAddress && link.addresses.includes(options.preferAddress)
    ? [options.preferAddress, ...link.addresses.filter(a => a !== options.preferAddress)]
    : link.addresses;
  let lastError: Error = new Error('The computer has no address');
  for (const address of ordered) {
    try {
      return await connectAddress(link, address, options);
    } catch (err: any) {
      if (err instanceof RejectedError) throw err;
      lastError = err;
    }
  }
  throw new Error(`Switchboard is not reachable. Is the computer on the same network, with mobile app access turned on? (${lastError.message})`);
}

const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

type ClientOptions = {
  link: DesktopLink;
  device: KeyPair;
  socketFactory?: WebSocketFactory;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  onStatus?: (status: ConnectionStatus) => void;
  onEvent?: (event: string, args: any[]) => void;
};

/** A paired computer: stays connected, reconnecting until closed or rejected. */
export class RemoteClient {
  private connection: Connection | null = null;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private nextId = 1;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private connecting = false;
  private lastAddress: string | undefined;
  status: ConnectionStatus = { state: 'connecting' };

  constructor(private readonly options: ClientOptions) {}

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.options.onStatus?.(status);
  }

  /** Connect now (or again, after an outage). */
  async start(): Promise<void> {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    // One attempt at a time: coming back to the foreground can ask again mid-attempt.
    if (this.connection || this.stopped || this.connecting) return;
    this.connecting = true;
    this.setStatus({ state: 'connecting' });
    try {
      const connection = await connectToDesktop(this.options.link, {
        device: this.options.device,
        connectTimeoutMs: this.options.connectTimeoutMs,
        socketFactory: this.options.socketFactory,
        preferAddress: this.lastAddress,
        onMessage: (message) => this.handleMessage(message),
        onClose: (code, reason) => this.handleClose(code, reason),
      });
      if (this.stopped) { connection.ws.close(1000, 'Closed'); return; }
      this.connection = connection;
      this.lastAddress = connection.address;
      this.retry = 0;
      this.setStatus({ state: 'online', address: connection.address, hello: connection.hello });
    } catch (err: any) {
      if (err instanceof RejectedError) { this.setStatus({ state: 'rejected', reason: err.reason, message: err.message }); return; }
      this.scheduleRetry(err?.message || 'Connection failed');
    } finally {
      this.connecting = false;
    }
  }

  private scheduleRetry(error: string) {
    if (this.stopped) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.retry, RETRY_DELAYS_MS.length - 1)];
    this.retry += 1;
    this.setStatus({ state: 'offline', retryInMs: delay, error });
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.start(); }, delay);
  }

  private handleMessage(message: any) {
    if (message.event) {
      this.options.onEvent?.(message.event, message.args || []);
      return;
    }
    const waiting = this.pending.get(message.id);
    if (!waiting) return;
    this.pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.error) waiting.reject(new Error(message.error));
    else waiting.resolve(message.result);
  }

  private handleClose(code: number, reason: string) {
    this.connection = null;
    for (const [, waiting] of this.pending) { clearTimeout(waiting.timer); waiting.reject(new Error('The connection was lost')); }
    this.pending.clear();
    if (this.stopped) return;
    const rejection = REJECTIONS[code];
    if (rejection && rejection !== 'protocol') {
      this.setStatus({ state: 'rejected', reason: rejection, message: rejectionMessage(rejection, reason) });
      return;
    }
    this.scheduleRetry(code === 1001 ? 'Mobile app access was turned off on the computer' : 'The connection was lost');
  }

  /** Call a method on the computer. Rejects when offline, on an error reply, or after the timeout. */
  request<T = any>(method: string, params: unknown[] = []): Promise<T> {
    const connection = this.connection;
    if (!connection) return Promise.reject(new Error('Not connected to the computer'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} took too long`));
      }, this.options.requestTimeoutMs ?? 20000);
      this.pending.set(id, { resolve, reject, timer });
      connection.ws.send(connection.channel.seal({ id, method, params }));
    });
  }

  /** Close for good (forgetting the computer, or leaving the app). */
  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.connection?.ws.close(1000, 'Closed');
    this.connection = null;
    this.setStatus({ state: 'closed' });
  }
}

/** Pair with a computer from its QR code: a new key for this phone, registered there. */
export async function pairWithDesktop(
  link: DesktopLink,
  pairingCode: Uint8Array,
  deviceName: string,
  options: { socketFactory?: WebSocketFactory; connectTimeoutMs?: number } = {},
): Promise<{ device: KeyPair; hello: Hello; address: string }> {
  const device = nacl.box.keyPair();
  const connection = await connectToDesktop(link, { ...options, device, mode: 'pair', pairingCode, deviceName });
  connection.ws.close(1000, 'Paired');
  return { device, hello: connection.hello, address: connection.address };
}
