// Types for remote-protocol.js, which is copied from switchboard (see
// scripts/sync-shared.mjs). Keep in step with that file.

export type KeyPair = { publicKey: Uint8Array; secretKey: Uint8Array };

export type Channel = {
  /** Encrypt a JSON-able value into one binary frame. */
  seal(value: unknown): Uint8Array;
  /** Decrypt one binary frame; throws on tampering, replay or a wrong direction. */
  open(frame: Uint8Array | ArrayBuffer): any;
};

export type HelloMessage = { t: 'hello'; v: number; mode: 'auth' | 'pair'; device: string; eph: string; name?: string };
export type ChallengeMessage = { t: 'challenge'; v: number; eph: string; nonce: string; box: string };
export type ProofMessage = { t: 'proof'; nonce: string; box: string };
export type PhoneState = { mode: 'auth' | 'pair'; ephemeral: KeyPair };

export type RemoteProtocol = {
  phoneHello(device: KeyPair, options?: { mode?: 'auth' | 'pair'; name?: string }): { message: HelloMessage; state: PhoneState };
  phoneAnswer(
    challenge: ChallengeMessage,
    state: PhoneState,
    device: KeyPair,
    desktopPublicKey: Uint8Array,
    pairingCode?: Uint8Array | null,
  ): { message: ProofMessage; channel: Channel };
  desktopChallenge(hello: HelloMessage, identity: KeyPair): { message: ChallengeMessage; state: any };
  desktopVerifyProof(proof: ProofMessage, state: any, identity: KeyPair): { channel: Channel; devicePublicKey: Uint8Array; pairingCode: Uint8Array | null };
};

export const PROTOCOL_VERSION: number;
export const KEY_BYTES: number;
export function createRemoteProtocol(nacl: unknown): RemoteProtocol;
export function toBase64(bytes: Uint8Array): string;
export function fromBase64(text: string): Uint8Array;
export function encodeUtf8(text: string): Uint8Array;
export function decodeUtf8(bytes: Uint8Array): string;
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean;
