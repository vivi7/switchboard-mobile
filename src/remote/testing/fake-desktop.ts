import nacl from 'tweetnacl';

import { createRemoteProtocol, toBase64, equalBytes, type KeyPair, type Channel } from '@/shared/vendor/remote-protocol';
import type { WebSocketFactory } from '../client';

const protocol = createRemoteProtocol(nacl);
const tick = (fn: () => void) => setTimeout(fn, 0);

/**
 * Switchboard on a computer, in memory: the desktop half of the protocol,
 * paired devices, one pairing code, and a few methods. Addresses not in
 * `reachable` behave like a network that does not answer.
 */
export class FakeDesktop {
  identity: KeyPair = nacl.box.keyPair();
  devices = new Map<string, { id: string; name: string }>();
  pairingCode: Uint8Array | null = null;
  reachable = new Set(['192.168.1.20']);
  methods: Record<string, (...params: any[]) => any> = {};
  sockets: FakeSocket[] = [];
  connections: string[] = [];

  factory: WebSocketFactory = (url) => {
    const socket = new FakeSocket(url, this);
    this.sockets.push(socket);
    return socket;
  };

  openPairing() {
    this.pairingCode = nacl.randomBytes(32);
    return this.pairingCode;
  }

  /** Close every live connection the way remote-server.js does. */
  closeAll(code: number, reason = '') {
    for (const socket of this.sockets) if (socket.channel) socket.serverClose(code, reason);
  }

  emit(event: string, ...args: any[]) {
    for (const socket of this.sockets) if (socket.channel && !socket.closed) socket.serverSendFrame({ event, args });
  }

  receive(socket: FakeSocket, data: string | Uint8Array) {
    if (typeof data === 'string') {
      const message = JSON.parse(data);
      if (message.t === 'hello') {
        const { message: challenge, state } = protocol.desktopChallenge(message, this.identity);
        const known = this.devices.has(toBase64(state.devicePublicKey));
        if (state.mode === 'auth' && !known) return socket.serverClose(4003, 'Unknown device');
        if (state.mode === 'pair' && !this.pairingCode) return socket.serverClose(4005, 'Pairing is not open');
        socket.handshake = state;
        socket.serverSendText(JSON.stringify(challenge));
        return;
      }
      const verified = protocol.desktopVerifyProof(message, socket.handshake, this.identity);
      const key = toBase64(verified.devicePublicKey);
      if (socket.handshake.mode === 'pair') {
        if (!this.pairingCode || !equalBytes(verified.pairingCode!, this.pairingCode)) return socket.serverClose(4005, 'Wrong pairing code');
        this.pairingCode = null;
        this.devices.set(key, { id: `device-${this.devices.size + 1}`, name: socket.handshake.name });
      }
      socket.channel = verified.channel;
      this.connections.push(socket.address);
      const device = this.devices.get(key)!;
      socket.serverSendFrame({ event: 'remote-access-hello', args: [{ v: 1, appVersion: '0.0.36', desktop: 'Test Mac', device, methods: Object.keys(this.methods) }] });
      return;
    }
    const request = socket.channel!.open(data);
    const method = this.methods[request.method];
    if (!method) return socket.serverSendFrame({ id: request.id, error: `Not available remotely: ${request.method}` });
    try {
      socket.serverSendFrame({ id: request.id, result: method(...request.params) });
    } catch (err: any) {
      socket.serverSendFrame({ id: request.id, error: err.message });
    }
  }
}

export class FakeSocket {
  binaryType = 'blob';
  readyState = 0;
  address: string;
  closed = false;
  handshake: any = null;
  channel: Channel | null = null;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: { data: any }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  constructor(url: string, private desktop: FakeDesktop) {
    this.address = new URL(url.replace(/^ws:/, 'http:')).hostname;
    if (!desktop.reachable.has(this.address)) {
      tick(() => { this.onerror?.({}); this.closed = true; this.onclose?.({ code: 1006, reason: '' }); });
      return;
    }
    tick(() => { this.readyState = 1; this.onopen?.({}); });
  }

  send(data: string | Uint8Array) {
    if (this.closed) throw new Error('Socket is closed');
    tick(() => this.desktop.receive(this, data));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    tick(() => this.onclose?.({ code, reason }));
  }

  serverSendText(text: string) {
    tick(() => { if (!this.closed) this.onmessage?.({ data: text }); });
  }

  serverSendFrame(value: unknown) {
    const frame = this.channel!.seal(value);
    const buffer = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength);
    tick(() => { if (!this.closed) this.onmessage?.({ data: buffer }); });
  }

  serverClose(code: number, reason: string) {
    this.close(code, reason);
  }
}
