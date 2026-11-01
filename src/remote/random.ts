import nacl from 'tweetnacl';
import { getRandomBytes } from 'expo-crypto';

// React Native has no crypto.getRandomValues for tweetnacl to find; give it
// the platform's secure generator. Imported once, before any key is made.
nacl.setPRNG((out: Uint8Array, length: number) => {
  out.set(getRandomBytes(length));
});
