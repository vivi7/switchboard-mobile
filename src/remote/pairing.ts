import { decodeUtf8, fromBase64, KEY_BYTES, PROTOCOL_VERSION } from '@/shared/vendor/remote-protocol';

/** What the pairing QR code on the desktop carries. */
export type PairingPayload = {
  version: number;
  desktopName: string;
  addresses: string[];
  port: number;
  desktopKey: Uint8Array;
  code: Uint8Array;
  expiresAt: number;
};

export class PairingLinkError extends Error {}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
}

/**
 * Read a pairing link: switchboard://pair?d=<base64url JSON>. Throws a
 * PairingLinkError with a message the user can act on.
 */
export function parsePairingLink(link: string, now = Date.now()): PairingPayload {
  const match = /^switchboard:\/\/pair\?(?:.*&)?d=([A-Za-z0-9_-]+)/.exec(link.trim());
  if (!match) throw new PairingLinkError('This is not a Switchboard pairing code.');
  let raw: any;
  try {
    raw = JSON.parse(decodeUtf8(fromBase64Url(match[1])));
  } catch {
    throw new PairingLinkError('The pairing code could not be read. Show a new one on the computer.');
  }
  if (raw?.v !== PROTOCOL_VERSION) {
    throw new PairingLinkError(raw?.v > PROTOCOL_VERSION
      ? 'Switchboard on the computer is newer than this app. Update the app.'
      : 'Switchboard on the computer is older than this app. Update Switchboard.');
  }
  const addresses = Array.isArray(raw.a) ? raw.a.filter((a: unknown) => typeof a === 'string' && a.length > 0) : [];
  let desktopKey: Uint8Array;
  let code: Uint8Array;
  try {
    desktopKey = fromBase64(raw.k);
    code = fromBase64(raw.c);
  } catch {
    throw new PairingLinkError('The pairing code is damaged. Show a new one on the computer.');
  }
  if (!addresses.length || !Number.isInteger(raw.p) || desktopKey.length !== KEY_BYTES || code.length !== KEY_BYTES) {
    throw new PairingLinkError('The pairing code is incomplete. Show a new one on the computer.');
  }
  if (typeof raw.x === 'number' && raw.x < now) {
    throw new PairingLinkError('This pairing code has expired. Show a new one on the computer.');
  }
  return {
    version: raw.v,
    desktopName: typeof raw.n === 'string' && raw.n ? raw.n : 'Computer',
    addresses,
    port: raw.p,
    desktopKey,
    code,
    expiresAt: raw.x,
  };
}
