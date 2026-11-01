import { expect, test } from '@jest/globals';
import { encodeUtf8, toBase64 } from '@/shared/vendor/remote-protocol';

import { PairingLinkError, parsePairingLink } from '../pairing';

/** A link built the way remote-server.js pairingLink() builds it. */
function link(payload: object) {
  const data = toBase64(encodeUtf8(JSON.stringify(payload))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `switchboard://pair?d=${data}`;
}

const key = toBase64(new Uint8Array(32).fill(251));
const code = toBase64(new Uint8Array(32).fill(7));
const valid = { v: 1, n: 'Studio Mac', a: ['192.168.1.20', 'studio-mac.local'], p: 47100, k: key, c: code, x: 2_000 };

test('a valid link gives the computer and the code', () => {
  const payload = parsePairingLink(link(valid), 1_000);
  expect(payload.desktopName).toBe('Studio Mac');
  expect(payload.addresses).toEqual(['192.168.1.20', 'studio-mac.local']);
  expect(payload.port).toBe(47100);
  expect([...payload.desktopKey]).toEqual(new Array(32).fill(251));
  expect([...payload.code]).toEqual(new Array(32).fill(7));
});

test('a link read from the real desktop (base64url, no padding) parses', () => {
  // As produced by switchboard's pairingLink for this payload.
  const real = 'switchboard://pair?d=eyJ2IjoxLCJuIjoiTWFjIiwiYSI6WyIxOTIuMTY4LjEuMjAiXSwicCI6NDcxMDAsImsiOiIrL3Y3Ky92NysvdjcrL3Y3Ky92NysvdjcrL3Y3Ky92NysvdjcrL3Y3Ky9zPSIsImMiOiJCd2NIQndjSEJ3Y0hCd2NIQndjSEJ3Y0hCd2NIQndjSEJ3Y0hCd2NIQndjPSIsIngiOjEyM30';
  expect(parsePairingLink(real, 0).addresses).toEqual(['192.168.1.20']);
});

test('anything else is refused with a message the user can act on', () => {
  expect(() => parsePairingLink('https://example.com')).toThrow('This is not a Switchboard pairing code.');
  expect(() => parsePairingLink('switchboard://pair?d=@@@')).toThrow(PairingLinkError);
  expect(() => parsePairingLink(link({ ...valid, v: 2 }), 1_000)).toThrow('newer than this app');
  expect(() => parsePairingLink(link({ ...valid, a: [] }), 1_000)).toThrow('incomplete');
  expect(() => parsePairingLink(link({ ...valid, k: 'AAAA' }), 1_000)).toThrow('incomplete');
  expect(() => parsePairingLink(link(valid), 3_000)).toThrow('expired');
});
