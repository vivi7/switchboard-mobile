// Copied from switchboard/remote-protocol.js at master 751c251 by scripts/sync-shared.mjs.
// Do not edit: change it in switchboard and sync again.

// The remote-access wire protocol, shared by the desktop server and the mobile
// app (which copies this file). It only needs tweetnacl, passed in, and uses
// nothing from Node, so the same code runs on both ends.
//
// Every connection starts with a handshake in JSON text frames:
//
//   phone → desktop  hello     { t, v, mode: 'auth'|'pair', device, eph, name? }
//   desktop → phone  challenge { t, v, eph, nonce, box }
//                    box = nacl.box(challenge(32) ‖ desktopEph(32)) from the
//                    desktop's static key to the phone's key
//   phone → desktop  proof     { t, nonce, box }
//                    box = nacl.box(challenge(32) ‖ phoneEph(32) [‖ pairingCode(32)])
//                    from the phone's key to the desktop's static key
//
// Opening the challenge proves the desktop holds the key from the QR code;
// opening the proof proves the phone holds a paired key (or the pairing
// code). Both ephemeral keys are inside a box, so neither can be swapped, and
// the session key is nacl.box.before(phoneEph, desktopEph): new for every
// connection. A replayed proof fails because the challenge is new each time.
//
// After the handshake every frame is binary: nonce(24) ‖ ciphertext. The
// nonce's first byte is the direction and its last eight bytes a counter that
// must grow, so a frame cannot be replayed or reflected back.

const PROTOCOL_VERSION = 1;
const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const DIRECTION_TO_PHONE = 1;
const DIRECTION_TO_DESKTOP = 2;

// --- base64 (no Buffer on the phone) ---

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = Object.fromEntries([...B64].map((c, i) => [c, i]));

function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

function fromBase64(text) {
  if (typeof text !== 'string' || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
    throw new Error('Invalid base64');
  }
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let j = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n = (B64_INDEX[text[i]] << 18) | (B64_INDEX[text[i + 1]] << 12)
      | ((B64_INDEX[text[i + 2]] ?? 0) << 6) | (B64_INDEX[text[i + 3]] ?? 0);
    if (j < bytes.length) bytes[j++] = (n >> 16) & 255;
    if (j < bytes.length) bytes[j++] = (n >> 8) & 255;
    if (j < bytes.length) bytes[j++] = n & 255;
  }
  return bytes;
}

// --- UTF-8 (React Native's engine is not guaranteed a TextDecoder) ---

function encodeUtf8(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    // A surrogate pair is one code point; a lone surrogate becomes U+FFFD.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) { code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00); i++; }
    }
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return Uint8Array.from(bytes);
}

function decodeUtf8(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let code, extra;
    if (b < 0x80) { code = b; extra = 0; }
    else if (b >= 0xf0) { code = b & 7; extra = 3; }
    else if (b >= 0xe0) { code = b & 15; extra = 2; }
    else if (b >= 0xc0) { code = b & 31; extra = 1; }
    else { out += '\ufffd'; i++; continue; }
    // A sequence cut off at the end of the input.
    if (extra && i + extra >= bytes.length) { out += '\ufffd'; break; }
    for (let k = 1; k <= extra; k++) code = (code << 6) | (bytes[i + k] & 63);
    i += extra + 1;
    out += String.fromCodePoint(code);
  }
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

function equalBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function keyFromBase64(text) {
  const key = fromBase64(text);
  if (key.length !== KEY_BYTES) throw new Error('Invalid key');
  return key;
}

function createRemoteProtocol(nacl) {
  /** A nonce for a frame: direction byte, zeros, then the counter (big-endian). */
  function frameNonce(direction, counter) {
    const nonce = new Uint8Array(NONCE_BYTES);
    nonce[0] = direction;
    // Counters stay well below 2^53; split into two 32-bit halves.
    const high = Math.floor(counter / 0x100000000);
    const low = counter >>> 0;
    nonce[16] = (high >>> 24) & 255; nonce[17] = (high >>> 16) & 255; nonce[18] = (high >>> 8) & 255; nonce[19] = high & 255;
    nonce[20] = (low >>> 24) & 255; nonce[21] = (low >>> 16) & 255; nonce[22] = (low >>> 8) & 255; nonce[23] = low & 255;
    return nonce;
  }

  function nonceCounter(nonce) {
    let high = 0, low = 0;
    for (let i = 16; i < 20; i++) high = high * 256 + nonce[i];
    for (let i = 20; i < 24; i++) low = low * 256 + nonce[i];
    return high * 0x100000000 + low;
  }

  /**
   * The encrypted channel after the handshake. `sendDirection` is the
   * direction this end writes; the other end's frames must carry the other one.
   */
  function createChannel(sharedKey, sendDirection) {
    const receiveDirection = sendDirection === DIRECTION_TO_PHONE ? DIRECTION_TO_DESKTOP : DIRECTION_TO_PHONE;
    let sent = 0;
    let lastReceived = 0;
    return {
      /** Encrypt a JSON-able value into one binary frame. */
      seal(value) {
        sent += 1;
        const nonce = frameNonce(sendDirection, sent);
        const box = nacl.box.after(encodeUtf8(JSON.stringify(value)), nonce, sharedKey);
        return concat(nonce, box);
      },
      /** Decrypt one binary frame; throws on tampering, replay or a wrong direction. */
      open(frame) {
        const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
        if (bytes.length <= NONCE_BYTES) throw new Error('Frame too short');
        const nonce = bytes.subarray(0, NONCE_BYTES);
        if (nonce[0] !== receiveDirection) throw new Error('Frame from the wrong direction');
        const counter = nonceCounter(nonce);
        if (counter <= lastReceived) throw new Error('Replayed frame');
        const plain = nacl.box.open.after(bytes.subarray(NONCE_BYTES), nonce, sharedKey);
        if (!plain) throw new Error('Frame failed to decrypt');
        lastReceived = counter;
        return JSON.parse(decodeUtf8(plain));
      },
    };
  }

  // --- Desktop side ---

  /**
   * Answer a phone's hello. Returns the challenge message to send and the
   * state needed to check the proof.
   */
  function desktopChallenge(hello, identity) {
    if (!hello || hello.t !== 'hello') throw new Error('Expected hello');
    if (hello.v !== PROTOCOL_VERSION) throw new Error(`Unsupported protocol version ${hello.v}`);
    if (hello.mode !== 'auth' && hello.mode !== 'pair') throw new Error('Unknown mode');
    const devicePublicKey = keyFromBase64(hello.device);
    const phoneEph = keyFromBase64(hello.eph);
    const ephemeral = nacl.box.keyPair();
    const challenge = nacl.randomBytes(KEY_BYTES);
    const nonce = nacl.randomBytes(NONCE_BYTES);
    const box = nacl.box(concat(challenge, ephemeral.publicKey), nonce, devicePublicKey, identity.secretKey);
    return {
      message: { t: 'challenge', v: PROTOCOL_VERSION, eph: toBase64(ephemeral.publicKey), nonce: toBase64(nonce), box: toBase64(box) },
      state: { mode: hello.mode, devicePublicKey, phoneEph, ephemeral, challenge, name: typeof hello.name === 'string' ? hello.name : '' },
    };
  }

  /**
   * Check a phone's proof. Returns { channel, devicePublicKey, pairingCode }
   * (the code only when pairing, for the caller to check), or throws.
   */
  function desktopVerifyProof(proof, state, identity) {
    if (!proof || proof.t !== 'proof') throw new Error('Expected proof');
    const plain = nacl.box.open(fromBase64(proof.box), fromBase64(proof.nonce), state.devicePublicKey, identity.secretKey);
    if (!plain) throw new Error('Proof failed to decrypt');
    const expected = state.mode === 'pair' ? 3 * KEY_BYTES : 2 * KEY_BYTES;
    if (plain.length !== expected) throw new Error('Proof has the wrong length');
    if (!equalBytes(plain.subarray(0, KEY_BYTES), state.challenge)) throw new Error('Wrong challenge');
    if (!equalBytes(plain.subarray(KEY_BYTES, 2 * KEY_BYTES), state.phoneEph)) throw new Error('Ephemeral key mismatch');
    const sharedKey = nacl.box.before(state.phoneEph, state.ephemeral.secretKey);
    return {
      channel: createChannel(sharedKey, DIRECTION_TO_PHONE),
      devicePublicKey: state.devicePublicKey,
      pairingCode: state.mode === 'pair' ? plain.subarray(2 * KEY_BYTES) : null,
    };
  }

  // --- Phone side ---

  /** Start a connection: the hello to send and the state for the challenge. */
  function phoneHello(device, { mode = 'auth', name = '' } = {}) {
    const ephemeral = nacl.box.keyPair();
    const hello = { t: 'hello', v: PROTOCOL_VERSION, mode, device: toBase64(device.publicKey), eph: toBase64(ephemeral.publicKey) };
    if (mode === 'pair') hello.name = name;
    return { message: hello, state: { mode, ephemeral } };
  }

  /**
   * Check the desktop's challenge against the key from the QR code and build
   * the proof. Returns { message, channel }, or throws.
   */
  function phoneAnswer(challengeMessage, state, device, desktopPublicKey, pairingCode = null) {
    if (!challengeMessage || challengeMessage.t !== 'challenge') throw new Error('Expected challenge');
    if (challengeMessage.v !== PROTOCOL_VERSION) throw new Error(`Unsupported protocol version ${challengeMessage.v}`);
    const plain = nacl.box.open(fromBase64(challengeMessage.box), fromBase64(challengeMessage.nonce), desktopPublicKey, device.secretKey);
    if (!plain || plain.length !== 2 * KEY_BYTES) throw new Error('Challenge is not from this desktop');
    const challenge = plain.subarray(0, KEY_BYTES);
    const desktopEph = plain.subarray(KEY_BYTES);
    if (!equalBytes(desktopEph, keyFromBase64(challengeMessage.eph))) throw new Error('Ephemeral key mismatch');
    const parts = [challenge, state.ephemeral.publicKey];
    if (state.mode === 'pair') {
      if (!pairingCode || pairingCode.length !== KEY_BYTES) throw new Error('Pairing needs the code from the QR');
      parts.push(pairingCode);
    }
    const nonce = nacl.randomBytes(NONCE_BYTES);
    const box = nacl.box(concat(...parts), nonce, desktopPublicKey, device.secretKey);
    const sharedKey = nacl.box.before(desktopEph, state.ephemeral.secretKey);
    return {
      message: { t: 'proof', nonce: toBase64(nonce), box: toBase64(box) },
      channel: createChannel(sharedKey, DIRECTION_TO_DESKTOP),
    };
  }

  return { desktopChallenge, desktopVerifyProof, phoneHello, phoneAnswer, createChannel };
}

module.exports = {
  PROTOCOL_VERSION,
  KEY_BYTES,
  DIRECTION_TO_PHONE,
  DIRECTION_TO_DESKTOP,
  createRemoteProtocol,
  toBase64,
  fromBase64,
  encodeUtf8,
  decodeUtf8,
  equalBytes,
};
